using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record SiteAgentHeartbeatInput(int SchemaVersion, Guid SiteId, int IntervalMs, int SpoolDepth);

public static class SiteAgentEndpoints
{
    public static void MapSiteAgentEndpoints(this RouteGroupBuilder api) =>
        api.MapPost("/site-agents/heartbeat", Heartbeat).RequireRateLimiting("site-heartbeat");

    private static async Task<IResult> Heartbeat(SiteAgentHeartbeatInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (input.SchemaVersion != 1 || input.SiteId == Guid.Empty ||
            input.IntervalMs is < 250 or > 3_600_000 || input.SpoolDepth is < 0 or > 10_000)
            return Results.BadRequest();
        var subject = AccessPolicy.Subject(http.User);
        var siteClaims = http.User.FindAll("site_id").ToArray();
        if (!AccessPolicy.HasRole(http.User, "SiteAgent") ||
            http.User.FindFirstValue("principal_type") != "workload" ||
            siteClaims.Length != 1 || !Guid.TryParse(siteClaims[0].Value, out var allowedSite) ||
            allowedSite != input.SiteId || subject.Length is < 1 or > 200)
            return Results.Forbid();
        if (!await db.Sites.AnyAsync(x => x.Id == input.SiteId, ct)) return Results.NotFound();
        var now = DateTime.UtcNow;
        var row = await db.SiteAgentHeartbeats.SingleOrDefaultAsync(x =>
            x.SiteId == input.SiteId && x.AgentId == subject, ct);
        if (row is null)
        {
            row = new SiteAgentHeartbeat
            {
                OrganizationId = db.OrganizationId, SiteId = input.SiteId, AgentId = subject
            };
            db.SiteAgentHeartbeats.Add(row);
        }
        row.LastSeenUtc = now;
        row.IntervalMs = input.IntervalMs;
        row.SpoolDepth = input.SpoolDepth;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation }) { return Results.Conflict(); }
        return Results.Accepted(value: new { input.SiteId, lastSeenAt = row.LastSeenUtc, row.SpoolDepth });
    }
}
