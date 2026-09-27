using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class IncidentFrontendEndpoints
{
    public static void MapIncidentFrontendEndpoints(this RouteGroupBuilder api) =>
        api.MapGet("/orgs/{orgId:guid}/incidents", List);

    private static async Task<IResult> List(Guid orgId, string? status, string? cursor, int? limit,
        HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!(AccessPolicy.HasRole(http.User, "Viewer") || AccessPolicy.HasRole(http.User, "Operator") ||
            AccessPolicy.HasRole(http.User, "Administrator"))) return Results.Forbid();
        if (limit is < 1 or > 100) return Results.BadRequest();
        IncidentState? selectedState = null;
        if (status is not null)
        {
            if (!Enum.TryParse<IncidentState>(status, true, out var parsed) || !Enum.IsDefined(parsed))
                return Results.BadRequest();
            selectedState = parsed;
        }
        var offset = 0;
        if (cursor is not null && (!cursor.StartsWith("o:") || !int.TryParse(cursor.AsSpan(2), out offset) ||
            offset < 0 || offset > 1_000_000)) return Results.BadRequest();

        var claims = http.User.FindAll("site_id").Select(x => x.Value).ToArray();
        var siteIds = claims.Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        var query = db.Incidents.AsNoTracking();
        if (!claims.Contains("*")) query = query.Where(x => siteIds.Contains(x.SiteId));
        if (selectedState is { } state) query = query.Where(x => x.State == state);
        var count = await query.CountAsync(ct);
        var size = limit ?? 50;
        var rows = await query.OrderByDescending(x => x.OpenedUtc).ThenByDescending(x => x.Id)
            .Skip(offset).Take(size).ToListAsync(ct);
        var org = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        if (org is null) return Results.Problem(statusCode: 503, detail: "Organization context is unavailable.");
        var ids = rows.Select(x => x.Id).ToArray();
        var rowSiteIds = rows.Select(x => x.SiteId).Distinct().ToArray();
        var sites = await db.Sites.AsNoTracking().Where(x => rowSiteIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        if (rows.Any(x => !sites.ContainsKey(x.SiteId)))
            return Results.Problem(statusCode: 503, detail: "Incident site context is unavailable.");
        var counts = await db.IncidentAssets.AsNoTracking().Where(x => ids.Contains(x.IncidentId))
            .GroupBy(x => x.IncidentId).Select(x => new { Id = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var primaryIds = rows.Select(x => x.PrimaryAssetId).Distinct().ToArray();
        var primaryAssets = await db.Assets.AsNoTracking().Where(x => primaryIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var zoneIds = primaryAssets.Values.Where(x => x.ZoneId is not null)
            .Select(x => x.ZoneId!.Value).Distinct().ToArray();
        var zones = await db.Zones.AsNoTracking().Where(x => zoneIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        return Results.Ok(new
        {
            items = rows.Select(row => new
            {
                row.Id, row.Title, severity = row.Severity.ToString().ToLowerInvariant(),
                status = row.State.ToString().ToLowerInvariant(), openedAt = row.OpenedUtc,
                updatedAt = row.UpdatedUtc,
                context = new
                {
                    organization = new { org.Id, org.Slug, org.Name },
                    region = sites[row.SiteId].RegionName,
                    site = new { sites[row.SiteId].Id, sites[row.SiteId].Code,
                        sites[row.SiteId].Name, sites[row.SiteId].Environment }
                },
                assetCount = counts.GetValueOrDefault(row.Id), owner = row.Owner,
                primaryAsset = primaryAssets.TryGetValue(row.PrimaryAssetId, out var asset)
                    ? FrontendEndpoints.ToSummary(asset, org, sites[row.SiteId],
                        asset.ZoneId is { } zoneId && zones.TryGetValue(zoneId, out var zone) ? zone : null)
                    : null
            }),
            page = new { nextCursor = offset + size < count ? $"o:{offset + size}" : null,
                totalEstimate = count }
        });
    }
}
