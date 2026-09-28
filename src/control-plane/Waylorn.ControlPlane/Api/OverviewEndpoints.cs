using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class OverviewEndpoints
{
    public static void MapOverviewEndpoints(this RouteGroupBuilder api) =>
        api.MapGet("/orgs/{orgId:guid}/overview", Get);

    private static async Task<IResult> Get(Guid orgId, HttpContext http, WaylornDbContext db,
        TelemetryPolicy telemetry, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!(AccessPolicy.HasRole(http.User, "Viewer") || AccessPolicy.HasRole(http.User, "Operator") ||
            AccessPolicy.HasRole(http.User, "Administrator"))) return Results.Forbid();
        var sites = await FrontendEndpoints.VisibleSites(http.User, db)
            .OrderBy(x => x.Code).Take(501).ToListAsync(ct);
        if (sites.Count > 500) return Results.Problem(statusCode: 413, detail: "Overview covers at most 500 sites.");
        var ids = sites.Select(x => x.Id).ToArray();
        var now = DateTime.UtcNow;
        var assetCounts = await db.Assets.AsNoTracking().Where(x => ids.Contains(x.SiteId))
            .GroupBy(x => x.SiteId).Select(x => new { x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var incidents = await db.Incidents.AsNoTracking()
            .Where(x => ids.Contains(x.SiteId) && x.State != IncidentState.Resolved)
            .GroupBy(x => new { x.SiteId, x.Severity })
            .Select(x => new { x.Key.SiteId, x.Key.Severity, Count = x.Count() })
            .ToListAsync(ct);
        var incidentCounts = incidents.ToDictionary(x => (x.SiteId, x.Severity), x => x.Count);
        var pending = AccessPolicy.HasRole(http.User, "Approver") &&
            http.User.FindFirst("principal_type")?.Value == "human"
            ? await db.Commands.AsNoTracking().CountAsync(x => ids.Contains(x.SiteId) &&
                x.State == CommandState.Pending && x.Risk == RiskClass.Amber &&
                x.Requester != AccessPolicy.Subject(http.User), ct)
            : 0;
        var cutoff = now - telemetry.Retention;
        var observed = db.Telemetry.AsNoTracking()
            .Where(x => ids.Contains(x.SiteId) && x.ObservedUtc >= cutoff);
        if (await observed.Select(x => x.AssetId).Distinct().CountAsync(ct) > 10_000)
            return Results.Problem(statusCode: 413, detail: "Overview telemetry exceeds the current site asset limit.");
        var latest = await observed
            .GroupBy(x => x.AssetId)
            .Select(x => x.OrderByDescending(s => s.ObservedUtc).First())
            .ToListAsync(ct);
        if (latest.Count > 10_000)
            return Results.Problem(statusCode: 413, detail: "Overview telemetry exceeds the current site asset limit.");
        var stale = latest.Where(x => now - x.ObservedUtc >
                TimeSpan.FromMilliseconds(2L * x.ExpectedIntervalMs))
            .GroupBy(x => x.SiteId).ToDictionary(x => x.Key, x => x.Count());
        return Results.Ok(new
        {
            generatedAt = DateTimeOffset.UtcNow, pendingApprovals = pending,
            sites = sites.Select(site => new
            {
                site = new
                {
                    site.Id, site.Code, site.Name, site.RegionName, site.Environment, site.Timezone,
                    connectivity = new { state = "unknown" }
                },
                assetHealth = new { ok = 0, warning = 0, fault = 0,
                    unknown = assetCounts.GetValueOrDefault(site.Id) },
                openIncidents = new
                {
                    critical = incidentCounts.GetValueOrDefault((site.Id, IncidentSeverity.Critical)),
                    warning = incidentCounts.GetValueOrDefault((site.Id, IncidentSeverity.Warning)),
                    notice = incidentCounts.GetValueOrDefault((site.Id, IncidentSeverity.Notice))
                },
                staleAssets = stale.GetValueOrDefault(site.Id)
            })
        });
    }

}
