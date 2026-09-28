using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

// IntervalMs is the interval the gateway currently runs at; RequestedIntervalMs is its locally approved
// interval. Gateways that predate the polling budget send only IntervalMs.
public sealed record SiteAgentHeartbeatInput(int SchemaVersion, Guid SiteId, int IntervalMs, int SpoolDepth,
    int? RequestedIntervalMs = null);

public static class SiteAgentEndpoints
{
    public static void MapSiteAgentEndpoints(this RouteGroupBuilder api) =>
        api.MapPost("/site-agents/heartbeat", Heartbeat).RequireRateLimiting("site-heartbeat");

    private static async Task<IResult> Heartbeat(SiteAgentHeartbeatInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (input.SchemaVersion != 1 || input.SiteId == Guid.Empty ||
            input.IntervalMs is < 250 or > 3_600_000 || input.SpoolDepth is < 0 or > 10_000 ||
            input.RequestedIntervalMs is < 250 or > 3_600_000)
            return Results.BadRequest();
        var requested = input.RequestedIntervalMs ?? input.IntervalMs;
        var subject = AccessPolicy.Subject(http.User);
        var siteClaims = http.User.FindAll("site_id").ToArray();
        if (!AccessPolicy.HasRole(http.User, "SiteAgent") ||
            http.User.FindFirstValue("principal_type") != "workload" ||
            siteClaims.Length != 1 || !Guid.TryParse(siteClaims[0].Value, out var allowedSite) ||
            allowedSite != input.SiteId || subject.Length is < 1 or > 200)
            return Results.Forbid();
        var budget = await db.Sites.Where(x => x.Id == input.SiteId)
            .Select(x => (int?)x.MaxPollsPerMinute).SingleOrDefaultAsync(ct);
        if (budget is null) return Results.NotFound();
        var now = DateTime.UtcNow;
        var row = await db.SiteAgentHeartbeats.SingleOrDefaultAsync(x =>
            x.SiteId == input.SiteId && x.AgentId == subject, ct);
        var others = await db.SiteAgentHeartbeats.AsNoTracking()
            .Where(x => x.SiteId == input.SiteId && x.AgentId != subject).Take(1_000).ToListAsync(ct);
        var live = others.Where(x => SiteConnectivityPolicy.Evaluate(x, now).State != "disconnected")
            .Select(x => x.RequestedIntervalMs);
        var assigned = PollingBudget.Assign(requested, live, budget.Value);
        if (row is null)
        {
            row = new SiteAgentHeartbeat
            {
                OrganizationId = db.OrganizationId, SiteId = input.SiteId, AgentId = subject
            };
            db.SiteAgentHeartbeats.Add(row);
        }
        row.LastSeenUtc = now;
        // The gateway adopts the assignment immediately, so contact freshness uses the slower of the two.
        row.IntervalMs = Math.Max(input.IntervalMs, assigned);
        row.RequestedIntervalMs = requested;
        row.SpoolDepth = input.SpoolDepth;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation }) { return Results.Conflict(); }
        return Results.Accepted(value: new { input.SiteId, lastSeenAt = row.LastSeenUtc, row.SpoolDepth,
            pollIntervalMs = assigned, maxPollsPerMinute = budget.Value });
    }
}
