using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Trace;
using Waylorn.ControlPlane.Api;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
var authority = builder.Configuration["Authentication:Authority"];
var audience = builder.Configuration["Authentication:Audience"];
var connection = builder.Configuration.GetConnectionString("Waylorn");
var insecureLoopback = builder.Environment.IsDevelopment() &&
    builder.Configuration.GetValue<bool>("Authentication:AllowInsecureLoopback") &&
    Uri.TryCreate(authority, UriKind.Absolute, out var localIssuer) &&
    localIssuer.IsLoopback && localIssuer.Scheme == "http";
if (string.IsNullOrWhiteSpace(authority) || !Uri.TryCreate(authority, UriKind.Absolute, out var issuer) ||
    (issuer.Scheme != "https" && !insecureLoopback) ||
    string.IsNullOrWhiteSpace(audience) || string.IsNullOrWhiteSpace(connection))
    throw new InvalidOperationException("HTTPS Keycloak authority, audience, and PostgreSQL connection are required.");

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped(sp =>
{
    var principal = sp.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
    return new TenantScope(principal is null ? Guid.Empty : AccessPolicy.OrganizationId(principal));
});
builder.Services.AddDbContext<WaylornDbContext>(options => options.UseNpgsql(connection));
builder.Services.AddSingleton<AssetCache>();
builder.Services.AddScoped<CommandWorkflow>();
var eventingEnabled = builder.Configuration.GetValue("Eventing:Enabled", !builder.Environment.IsDevelopment());
if (builder.Configuration.GetValue<bool>("Eventing:BootstrapDestinations") && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Automatic broker provisioning is allowed only in Development.");
if (eventingEnabled)
{
    if (string.IsNullOrWhiteSpace(builder.Configuration["Eventing:NatsUrl"]) ||
        string.IsNullOrWhiteSpace(builder.Configuration["Eventing:KafkaBootstrapServers"]))
        throw new InvalidOperationException("NATS and Kafka addresses are required when eventing is enabled.");
    foreach (var destination in new[] { OutboxDestination.Audit, OutboxDestination.Control })
        builder.Services.AddSingleton<IHostedService>(sp => new OutboxPublisher(
            sp.GetRequiredService<IServiceScopeFactory>(), sp.GetRequiredService<IConfiguration>(),
            sp.GetRequiredService<ILogger<OutboxPublisher>>(), destination));
}
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.Authority = authority;
    options.Audience = audience;
    options.MapInboundClaims = false;
    options.RequireHttpsMetadata = !insecureLoopback;
});
builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("api", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});
builder.Services.AddOpenTelemetry().WithTracing(tracing => tracing.AddAspNetCoreInstrumentation());

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health/live", () => Results.Ok(new { status = "live" }));
app.MapGet("/health/ready", async (WaylornDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ready" }) : Results.StatusCode(503));

var api = app.MapGroup("/api/v1").RequireAuthorization().RequireRateLimiting("api");
api.MapAssetEndpoints();
api.MapCommandEndpoints();
app.Run();

public partial class Program;
