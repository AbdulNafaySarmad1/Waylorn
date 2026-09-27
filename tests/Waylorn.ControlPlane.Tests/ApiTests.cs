using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Waylorn.ControlPlane.Infrastructure;
using Xunit;

namespace Waylorn.ControlPlane.Tests;

public class ApiTests
{
    [Fact]
    public async Task Assets_relationships_approval_and_audit_are_enforced_over_http()
    {
        await using var sqlite = new SqliteConnection("Data Source=:memory:");
        await sqlite.OpenAsync();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
        {
            host.UseSetting("Authentication:Authority", "https://keycloak.example.test/realms/waylorn");
            host.UseSetting("Authentication:Audience", "waylorn-api");
            host.UseSetting("ConnectionStrings:Waylorn", "Host=localhost;Database=unused");
            host.ConfigureTestServices(services =>
            {
                services.RemoveAll<DbContextOptions<WaylornDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<WaylornDbContext>>();
                services.AddDbContext<WaylornDbContext>(options => options.UseSqlite(sqlite));
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = "Test";
                    options.DefaultChallengeScheme = "Test";
                    options.DefaultForbidScheme = "Test";
                }).AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            });
        });
        using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<WaylornDbContext>().Database.EnsureCreatedAsync();

        var org = Guid.NewGuid();
        var site = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
        SetIdentity(client, org, site, "Administrator", "admin");
        var first = await CreateAsset(client, site, "PLC-1");
        var second = await CreateAsset(client, site, "Gateway-1");
        var disposable = await CreateAsset(client, site, "Temporary");
        var updated = await client.PutAsJsonAsync($"/api/v1/assets/{first}",
            new { version = 1, siteId = site, kind = "Industrial", name = "PLC-1-updated" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(2, (await updated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt64());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/v1/assets/{disposable}?version=1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/assets/{disposable}")).StatusCode);

        var relation = await client.PostAsJsonAsync("/api/v1/relationships",
            new { sourceAssetId = first, targetAssetId = second, kind = "ConnectedTo" });
        Assert.Equal(HttpStatusCode.Created, relation.StatusCode);
        var listed = await client.GetAsync($"/api/v1/assets/{first}/relationships");
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        Assert.Single((await listed.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray());

        var start = DateTimeOffset.UtcNow.AddMinutes(-1);
        var end = DateTimeOffset.UtcNow.AddMinutes(5);
        client.DefaultRequestHeaders.Add("Idempotency-Key", "command-request-001");
        var requested = await client.PostAsJsonAsync("/api/v1/commands",
            new { assetId = first, operation = "ChangeConfiguration", changeTicket = "CHG-1", windowStartUtc = start, windowEndUtc = end });
        Assert.Equal(HttpStatusCode.Created, requested.StatusCode);
        var commandId = (await requested.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var repeated = await client.PostAsJsonAsync("/api/v1/commands",
            new { assetId = first, operation = "ChangeConfiguration", changeTicket = "CHG-1", windowStartUtc = start, windowEndUtc = end });
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);

        SetIdentity(client, org, site, "Approver", "admin");
        var selfApproval = await client.PostAsync($"/api/v1/commands/{commandId}/approve", null);
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);
        Assert.Equal("application/problem+json", selfApproval.Content.Headers.ContentType?.MediaType);
        SetIdentity(client, org, site, "Approver", "approver");
        var approved = await client.PostAsync($"/api/v1/commands/{commandId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("Approved", (await approved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("state").GetString());

        SetIdentity(client, Guid.NewGuid(), site, "Administrator", "outsider");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/assets/{first}")).StatusCode);

        using var checkScope = factory.Services.CreateScope();
        var db = checkScope.ServiceProvider.GetRequiredService<WaylornDbContext>();
        Assert.Equal(0, await db.Audit.CountAsync()); // Tenant filter hides another organization's audit.
        Assert.Equal(0, await db.Commands.CountAsync());
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(sqlite).Options;
        await using var ownerDb = new WaylornDbContext(options, new TenantScope(org));
        Assert.Equal(9, await ownerDb.Audit.CountAsync());
        Assert.Single(await ownerDb.Commands.ToListAsync());
        Assert.Equal(9, await ownerDb.Outbox.CountAsync(x => x.Destination == Waylorn.ControlPlane.Domain.OutboxDestination.Audit));
        Assert.Equal(2, await ownerDb.Outbox.CountAsync(x => x.Destination == Waylorn.ControlPlane.Domain.OutboxDestination.Control));
        var eventPayload = JsonDocument.Parse((await ownerDb.Outbox.FirstAsync()).Payload);
        Assert.Equal(1, eventPayload.RootElement.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(org, eventPayload.RootElement.GetProperty("organizationId").GetGuid());
    }

    private static async Task<Guid> CreateAsset(HttpClient client, Guid site, string name)
    {
        var response = await client.PostAsJsonAsync("/api/v1/assets", new { siteId = site, kind = "Industrial", name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static void SetIdentity(HttpClient client, Guid org, Guid site, string role, string subject)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Org");
        client.DefaultRequestHeaders.Remove("X-Test-Site");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-Subject");
        client.DefaultRequestHeaders.Add("X-Test-Org", org.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Site", site.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        client.DefaultRequestHeaders.Add("X-Test-Subject", subject);
    }
}

internal sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim("org_id", Request.Headers["X-Test-Org"].ToString()),
            new Claim("site_id", Request.Headers["X-Test-Site"].ToString()),
            new Claim("waylorn_role", Request.Headers["X-Test-Role"].ToString()),
            new Claim("sub", Request.Headers["X-Test-Subject"].ToString()),
            new Claim("principal_type", "human"),
            new Claim("amr", "mfa")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, "Test")));
    }
}
