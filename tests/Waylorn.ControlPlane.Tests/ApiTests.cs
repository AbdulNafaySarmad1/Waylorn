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
    public async Task Raw_observation_ingest_is_disabled_without_site_local_opt_in()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
        {
            host.UseSetting("Authentication:Authority", "https://keycloak.example.test/realms/waylorn");
            host.UseSetting("Authentication:Audience", "waylorn-api");
            host.UseSetting("ConnectionStrings:Waylorn", "Host=localhost;Database=unused");
            host.ConfigureTestServices(services => services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = "Test";
                options.DefaultChallengeScheme = "Test";
                options.DefaultForbidScheme = "Test";
            }).AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { }));
        });
        using var client = factory.CreateClient();
        SetIdentity(client, Guid.NewGuid(), Guid.NewGuid(), "SiteAgent", "agent");
        var response = await client.PostAsJsonAsync("/api/v1/observations", new { schemaVersion = 1 });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

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
            host.UseSetting("Telemetry:AcceptRawObservations", "true");
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
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/organization",
            new { slug = "test-org", name = "Test Organization" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/sites",
            new { id = site, code = "TEST-1", name = "Test Plant", regionName = "Test Region",
                timezone = "UTC", environment = "lab" })).StatusCode);
        var zone = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/v1/sites/{site}/zones",
            new { id = zone, code = "ZONE-1", name = "Test Zone" })).StatusCode);
        Assert.Single((await (await client.GetAsync("/api/v1/sites")).Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray());
        var first = await CreateAsset(client, site, "PLC-1");
        var second = await CreateAsset(client, site, "Gateway-1");
        var opened = await client.PostAsJsonAsync("/api/v1/incidents", new
        {
            siteId = site, assetIds = new[] { first, second }, title = "Test network interruption",
            severity = "Critical", owner = "shift-lead"
        });
        Assert.Equal(HttpStatusCode.Created, opened.StatusCode);
        var incidentId = (await opened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var webIncidents = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/incidents?status=open");
        Assert.Equal(2, webIncidents.GetProperty("items")[0].GetProperty("assetCount").GetInt32());
        Assert.Equal("critical", webIncidents.GetProperty("items")[0].GetProperty("severity").GetString());
        Assert.Equal(first, webIncidents.GetProperty("items")[0].GetProperty("primaryAsset").GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/v1/incidents/{incidentId}",
            new { state = "Acknowledged", version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsJsonAsync($"/api/v1/incidents/{incidentId}",
            new { state = "Resolved", version = 2 })).StatusCode);
        var workOrder = await client.PostAsJsonAsync("/api/v1/work-orders", new
        {
            assetId = first, title = "Inspect fieldbus", type = "Inspection",
            dueUtc = DateTimeOffset.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.Created, workOrder.StatusCode);
        var orderId = (await workOrder.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/v1/work-orders/{orderId}",
            new { state = "Scheduled", version = 1 })).StatusCode);
        var maintenance = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/assets/{first}/maintenance");
        Assert.Equal("scheduled", maintenance.GetProperty("items")[0].GetProperty("status").GetString());
        var observed = DateTimeOffset.UtcNow.AddSeconds(-2);
        var observation = new { schemaVersion = 1, requestId = Guid.NewGuid(), siteId = site, assetId = first,
            source = "site-agent/modbus-tcp", observedUtc = observed, expectedIntervalMs = 1000,
            values = new[] { new { signalKey = "modbus.holding.10", value = 1234 } } };
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/v1/observations", observation)).StatusCode);
        SetIdentity(client, org, site, "SiteAgent", "agent-1");
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/observations", observation)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/observations", observation)).StatusCode);
        var changed = new { observation.schemaVersion, observation.requestId, observation.siteId, observation.assetId,
            observation.source, observation.observedUtc, observation.expectedIntervalMs,
            values = new[] { new { signalKey = "modbus.holding.10", value = 9999 } } };
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/observations", changed)).StatusCode);
        SetIdentity(client, org, site, "Administrator", "admin");
        var live = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/assets/{first}/live");
        Assert.Equal(1234, live.GetProperty("signals")[0].GetProperty("value").GetInt32());
        using (var streamCts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
        using (var response = await client.GetAsync($"/api/v0/orgs/{org}/assets/{first}/live/stream",
            HttpCompletionOption.ResponseHeadersRead, streamCts.Token))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
            using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(streamCts.Token));
            Assert.StartsWith("id: ", await reader.ReadLineAsync(streamCts.Token));
            Assert.Equal("event: signal", await reader.ReadLineAsync(streamCts.Token));
            Assert.Contains("\"value\":1234", await reader.ReadLineAsync(streamCts.Token));
        }
        var signalList = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/assets/{first}/telemetry/signals");
        Assert.Equal("modbus.holding.10", signalList.GetProperty("items")[0].GetProperty("key").GetString());
        var seriesUrl = $"/api/v0/orgs/{org}/assets/{first}/telemetry/series?signal=modbus.holding.10" +
            $"&from={Uri.EscapeDataString(observed.AddMinutes(-1).ToString("O"))}" +
            $"&to={Uri.EscapeDataString(observed.AddMinutes(1).ToString("O"))}&maxPoints=100";
        var series = await client.GetFromJsonAsync<JsonElement>(seriesUrl);
        Assert.Equal(1234, series.GetProperty("buckets")[0].GetProperty("mean").GetDouble());
        var me = await client.GetFromJsonAsync<JsonElement>("/api/v0/me");
        Assert.Equal(org, me.GetProperty("organizations")[0].GetProperty("id").GetGuid());
        var webSites = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/sites");
        Assert.Equal(site, webSites.GetProperty("items")[0].GetProperty("id").GetGuid());
        var regions = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/hierarchy");
        var regionId = regions.GetProperty("items")[0].GetProperty("id").GetString();
        var siteNodes = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/hierarchy?parentId={Uri.EscapeDataString(regionId!)}");
        Assert.Equal(site, siteNodes.GetProperty("items")[0].GetProperty("id").GetGuid());
        var zoneNodes = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/hierarchy?parentId={site}");
        Assert.Equal(zone, zoneNodes.GetProperty("items")[0].GetProperty("id").GetGuid());
        var webAssets = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/assets?siteId={site}&limit=1");
        Assert.Single(webAssets.GetProperty("items").EnumerateArray());
        Assert.Equal("unknown", webAssets.GetProperty("items")[0].GetProperty("lifecycle").GetString());
        Assert.NotEqual(JsonValueKind.Null, webAssets.GetProperty("page").GetProperty("nextCursor").ValueKind);
        var webDetail = await client.GetFromJsonAsync<JsonElement>($"/api/v0/orgs/{org}/assets/{first}");
        Assert.Equal(first, webDetail.GetProperty("id").GetGuid());
        Assert.False(webDetail.TryGetProperty("extension", out _));
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
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v0/orgs/{org}/assets?siteId={site}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/incidents", new
        {
            siteId = site, assetIds = new[] { first }, title = "Unauthorized", severity = "Warning"
        })).StatusCode);
        var selfApproval = await client.PostAsync($"/api/v1/commands/{commandId}/approve", null);
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);
        Assert.Equal("application/problem+json", selfApproval.Content.Headers.ContentType?.MediaType);
        SetIdentity(client, org, site, "Approver", "approver");
        var approved = await client.PostAsync($"/api/v1/commands/{commandId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("Approved", (await approved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("state").GetString());

        SetIdentity(client, Guid.NewGuid(), site, "Administrator", "outsider");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/assets/{first}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v0/orgs/{org}/assets/{first}")).StatusCode);

        using var checkScope = factory.Services.CreateScope();
        var db = checkScope.ServiceProvider.GetRequiredService<WaylornDbContext>();
        Assert.Equal(0, await db.Audit.CountAsync()); // Tenant filter hides another organization's audit.
        Assert.Equal(0, await db.Commands.CountAsync());
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(sqlite).Options;
        await using var ownerDb = new WaylornDbContext(options, new TenantScope(org));
        Assert.Equal(17, await ownerDb.Audit.CountAsync());
        Assert.Single(await ownerDb.Commands.ToListAsync());
        Assert.Equal(17, await ownerDb.Outbox.CountAsync(x => x.Destination == Waylorn.ControlPlane.Domain.OutboxDestination.Audit));
        Assert.Equal(2, await ownerDb.Outbox.CountAsync(x => x.Destination == Waylorn.ControlPlane.Domain.OutboxDestination.Control));
        Assert.Equal(4, await ownerDb.Outbox.CountAsync(x => x.Destination == Waylorn.ControlPlane.Domain.OutboxDestination.Operations));
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
            new Claim("principal_type", Request.Headers["X-Test-Role"] == "SiteAgent" ? "workload" : "human"),
            new Claim("amr", "mfa")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, "Test")));
    }
}
