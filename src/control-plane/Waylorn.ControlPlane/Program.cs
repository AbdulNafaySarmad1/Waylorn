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
builder.Services.AddHttpClient("identity-readiness", client =>
{
    client.Timeout = TimeSpan.FromSeconds(3);
    client.MaxResponseContentBufferSize = 256 * 1024;
});
builder.Services.AddSingleton<IIdentityReadiness, IdentityReadiness>();
builder.Services.AddSingleton<EventingReadiness>();
builder.Services.AddSingleton(AuditIntegrity.FromConfiguration(builder.Configuration,
    required: !builder.Environment.IsDevelopment()));
builder.Services.AddSingleton<AssetCache>();
var retentionDays = builder.Configuration.GetValue("Telemetry:RetentionDays", 7);
if (retentionDays is < 1 or > 365)
    throw new InvalidOperationException("Telemetry retention must be between 1 and 365 days.");
builder.Services.AddSingleton(new TelemetryPolicy(retentionDays));
builder.Services.AddHostedService<TelemetryRetentionWorker>();
builder.Services.AddScoped<CommandWorkflow>();
var eventingEnabled = builder.Configuration.GetValue("Eventing:Enabled", !builder.Environment.IsDevelopment());
if (builder.Configuration.GetValue<bool>("Eventing:BootstrapDestinations") && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Automatic broker provisioning is allowed only in Development.");
if (eventingEnabled)
{
    if (string.IsNullOrWhiteSpace(builder.Configuration["Eventing:NatsUrl"]) ||
        string.IsNullOrWhiteSpace(builder.Configuration["Eventing:KafkaBootstrapServers"]))
        throw new InvalidOperationException("NATS and Kafka addresses are required when eventing is enabled.");
    foreach (var destination in new[] { OutboxDestination.Audit, OutboxDestination.Control, OutboxDestination.Operations })
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
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
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
app.MapGet("/health/ready", async (WaylornDbContext db, IIdentityReadiness identity, CancellationToken ct) =>
{
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
    timeout.CancelAfter(TimeSpan.FromSeconds(3));
    try
    {
        return await db.Database.CanConnectAsync(timeout.Token) && await identity.IsReady(timeout.Token)
            ? Results.Ok(new { status = "ready" }) : Results.StatusCode(503);
    }
    catch (Exception) when (!ct.IsCancellationRequested)
    {
        return Results.StatusCode(503);
    }
});
app.MapGet("/health/eventing", async (EventingReadiness eventing, CancellationToken ct) =>
    !eventing.Enabled ? Results.Ok(new { status = "disabled" }) :
    await eventing.IsReady(ct) ? Results.Ok(new { status = "ready" }) : Results.StatusCode(503));

var api = app.MapGroup("/api/v1").RequireAuthorization().RequireRateLimiting("api");
api.MapTenancyEndpoints();
api.MapAuditEndpoints();
api.MapOutboxStatusEndpoints();
var frontend = app.MapGroup("/api/v0").RequireAuthorization().RequireRateLimiting("api");
frontend.MapFrontendEndpoints();
frontend.MapTelemetryEndpoints();
frontend.MapIncidentFrontendEndpoints();
frontend.MapMaintenanceFrontendEndpoints();
frontend.MapTopologyEndpoints();
frontend.MapActionFrontendEndpoints();
frontend.MapOverviewEndpoints();
api.MapAssetEndpoints();
api.MapCommandEndpoints();
api.MapObservationEndpoints();
api.MapSiteAgentEndpoints();
api.MapIncidentEndpoints();
api.MapMaintenanceEndpoints();
app.Run();

public partial class Program;
