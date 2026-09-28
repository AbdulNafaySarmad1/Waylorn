using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

// Adapter for the frontend's draft read-only /api/v0 contract. Unimplemented data domains stay unavailable.
public static class FrontendEndpoints
{
    public static void MapFrontendEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/me", Me);
        api.MapGet("/orgs/{orgId:guid}/sites", Sites);
        api.MapGet("/orgs/{orgId:guid}/hierarchy", Hierarchy);
        api.MapGet("/orgs/{orgId:guid}/assets", Assets);
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}", AssetDetail);
    }

    private static async Task<IResult> Me(HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        var subject = AccessPolicy.Subject(http.User);
        if (subject.Length == 0 || db.OrganizationId == Guid.Empty) return Results.Forbid();
        var org = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        var roles = http.User.FindAll("waylorn_role").Select(x => x.Value).Distinct().ToArray();
        var organizations = org is null ? [] : new[] { new
        {
            org.Id, org.Slug, org.Name, roles
        } };
        return Results.Ok(new
        {
            subject,
            displayName = http.User.FindFirstValue("name") ??
                http.User.FindFirstValue("preferred_username") ?? subject,
            email = http.User.FindFirstValue("email"),
            identityProvider = new { id = "keycloak", displayName = "Keycloak", protocol = "oidc" },
            organizations
        });
    }

    private static async Task<IResult> Sites(Guid orgId, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!InOrganization(orgId, db)) return Results.NotFound();
        var sites = await VisibleSites(http.User, db).OrderBy(x => x.Code).Take(500).ToListAsync(ct);
        var siteIds = sites.Select(x => x.Id).ToArray();
        var heartbeats = await db.SiteAgentHeartbeats.AsNoTracking()
            .Where(x => siteIds.Contains(x.SiteId)).ToListAsync(ct);
        var latest = heartbeats.GroupBy(x => x.SiteId)
            .ToDictionary(x => x.Key, x => x.MaxBy(h => h.LastSeenUtc));
        var now = DateTime.UtcNow;
        return Results.Ok(new { items = sites.Select(x => new
        {
            x.Id, x.Code, x.Name, x.RegionName, x.Environment, x.Timezone,
            connectivity = SiteConnectivityPolicy.Evaluate(latest.GetValueOrDefault(x.Id), now)
        }) });
    }

    private static async Task<IResult> Hierarchy(Guid orgId, string? parentId, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (!InOrganization(orgId, db)) return Results.NotFound();
        var sites = await VisibleSites(http.User, db).OrderBy(x => x.Code).Take(500).ToListAsync(ct);
        var siteIds = sites.Select(x => x.Id).ToArray();
        var zones = await db.Zones.AsNoTracking().Where(x => siteIds.Contains(x.SiteId)).ToListAsync(ct);
        var siteCounts = await db.Assets.AsNoTracking().Where(x => siteIds.Contains(x.SiteId))
            .GroupBy(x => x.SiteId).Select(x => new { Id = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var zoneCounts = await db.Assets.AsNoTracking().Where(x => x.ZoneId != null && siteIds.Contains(x.SiteId))
            .GroupBy(x => x.ZoneId!.Value).Select(x => new { Id = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);

        if (parentId is null)
        {
            var regions = sites.GroupBy(x => x.RegionName).OrderBy(x => x.Key)
                .Select(group => new HierarchyNodeView(RegionId(group.Key), "region", group.Key,
                    null, null, group.Count(), group.Sum(site => siteCounts.GetValueOrDefault(site.Id))));
            return Results.Ok(new { items = regions });
        }
        var region = sites.GroupBy(x => x.RegionName).FirstOrDefault(x => RegionId(x.Key) == parentId);
        if (region is not null)
        {
            var children = region.Select(site => new HierarchyNodeView(site.Id.ToString(), "site", site.Name,
                site.Code, parentId, zones.Count(x => x.SiteId == site.Id), siteCounts.GetValueOrDefault(site.Id)));
            return Results.Ok(new { items = children });
        }
        if (Guid.TryParse(parentId, out var id) && sites.Any(x => x.Id == id))
        {
            var children = zones.Where(x => x.SiteId == id).OrderBy(x => x.Code)
                .Select(zone => new HierarchyNodeView(zone.Id.ToString(), "zone", zone.Name,
                    zone.Code, parentId, 0, zoneCounts.GetValueOrDefault(zone.Id)));
            return Results.Ok(new { items = children });
        }
        if (Guid.TryParse(parentId, out id) && zones.Any(x => x.Id == id))
            return Results.Ok(new { items = Array.Empty<HierarchyNodeView>() });
        return Results.NotFound();
    }

    private static async Task<IResult> Assets(Guid orgId, Guid? siteId, Guid? zoneId,
        string? lineId, string? kind, string? health, string? lifecycle, string? q,
        string? sort, string? cursor, int? limit, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!InOrganization(orgId, db)) return Results.NotFound();
        if (!(AccessPolicy.HasRole(http.User, "Viewer") || AccessPolicy.HasRole(http.User, "Operator") ||
            AccessPolicy.HasRole(http.User, "Administrator"))) return Results.Forbid();
        if (limit is < 1 or > 100 || q?.Length > 200) return Results.BadRequest();
        if (lineId is not null || sort is not null and not ("name" or "tag") ||
            health is not null and not "unknown" || lifecycle is not null and not "unknown")
            return Results.Problem(statusCode: 501, detail: "This asset filter is not available from the current data source.");
        if (siteId is { } selected && !AccessPolicy.CanRead(http.User, selected)) return Results.NotFound();
        if (kind is not null && !TryKind(kind, out _)) return Results.BadRequest();
        var offset = 0;
        if (cursor is not null && (!cursor.StartsWith("o:") || !int.TryParse(cursor.AsSpan(2), out offset) ||
            offset < 0 || offset > 1_000_000)) return Results.BadRequest();

        var visibleSites = VisibleSites(http.User, db).Select(x => x.Id);
        var query = db.Assets.AsNoTracking().Where(x => visibleSites.Contains(x.SiteId));
        if (siteId is { } site) query = query.Where(x => x.SiteId == site);
        if (zoneId is { } zone) query = query.Where(x => x.ZoneId == zone);
        if (kind is not null && TryKind(kind, out var parsedKind)) query = query.Where(x => x.Kind == parsedKind);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(term) ||
                (x.Manufacturer != null && x.Manufacturer.ToLower().Contains(term)) ||
                (x.Model != null && x.Model.ToLower().Contains(term)) ||
                (x.Serial != null && x.Serial.ToLower().Contains(term)));
        }
        var count = await query.CountAsync(ct);
        var size = limit ?? 50;
        query = sort == "tag" ? query.OrderBy(x => x.Id) : query.OrderBy(x => x.Name).ThenBy(x => x.Id);
        var assets = await query.Skip(offset).Take(size).ToListAsync(ct);
        var context = await ContextRows(assets, db, ct);
        if (context is null) return Results.Problem(statusCode: 503, detail: "Asset site context is unavailable.");
        var items = assets.Select(x => ToSummary(x, context.Value.Org, context.Value.Sites[x.SiteId],
            x.ZoneId is { } zid && context.Value.Zones.TryGetValue(zid, out var z) ? z : null)).ToArray();
        return Results.Ok(new { items, page = new
        {
            nextCursor = offset + size < count ? $"o:{offset + size}" : null,
            totalEstimate = count
        } });
    }

    private static async Task<IResult> AssetDetail(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (!InOrganization(orgId, db)) return Results.NotFound();
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == assetId, ct);
        if (asset is null || !AccessPolicy.CanRead(http.User, asset.SiteId)) return Results.NotFound();
        var context = await ContextRows([asset], db, ct);
        if (context is null) return Results.Problem(statusCode: 503, detail: "Asset site context is unavailable.");
        var summary = ToSummary(asset, context.Value.Org, context.Value.Sites[asset.SiteId],
            asset.ZoneId is { } zid && context.Value.Zones.TryGetValue(zid, out var z) ? z : null);
        return Results.Ok(new
        {
            summary.Id, summary.Kind, summary.Name, summary.Tag, summary.Manufacturer, summary.Model,
            summary.Context, summary.Lifecycle, summary.Health, summary.Connectivity,
            summary.IdentityConfidence,
            capabilities = Array.Empty<object>(), protocols = Array.Empty<object>(),
            interfaces = Array.Empty<object>(), vendorAttributes = Array.Empty<object>(),
            externalReferences = Array.Empty<object>(), permittedActions = Array.Empty<object>()
        });
    }

    private static bool InOrganization(Guid orgId, WaylornDbContext db) =>
        orgId != Guid.Empty && orgId == db.OrganizationId;

    private static string RegionId(string name) =>
        "region:" + WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(name));

    internal static IQueryable<Site> VisibleSites(ClaimsPrincipal principal, WaylornDbContext db)
    {
        var ids = principal.FindAll("site_id").Select(x => x.Value)
            .Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        return principal.FindAll("site_id").Any(x => x.Value == "*") ? db.Sites.AsNoTracking() :
            db.Sites.AsNoTracking().Where(x => ids.Contains(x.Id));
    }

    private static async Task<(Organization Org, Dictionary<Guid, Site> Sites, Dictionary<Guid, Zone> Zones)?>
        ContextRows(IReadOnlyCollection<Asset> assets, WaylornDbContext db, CancellationToken ct)
    {
        var org = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        if (org is null) return null;
        var siteIds = assets.Select(x => x.SiteId).Distinct().ToArray();
        var sites = await db.Sites.AsNoTracking().Where(x => siteIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        if (sites.Count != siteIds.Length) return null;
        var zoneIds = assets.Where(x => x.ZoneId != null).Select(x => x.ZoneId!.Value).Distinct().ToArray();
        var zones = await db.Zones.AsNoTracking().Where(x => zoneIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return (org, sites, zones);
    }

    internal static FrontendAssetSummary ToSummary(Asset asset, Organization org, Site site, Zone? zone) => new(
        asset.Id, KindName(asset.Kind), asset.Name, $"UNASSIGNED-{asset.Id:N}", asset.Manufacturer, asset.Model,
        new(new(org.Id, org.Slug, org.Name), site.RegionName,
            new(site.Id, site.Code, site.Name, site.Environment),
            zone is null ? null : new(zone.Id, zone.Name)),
        "unknown", new("unknown"), new("unknown"), "unverified");

    internal static string KindName(AssetKind kind) => kind switch
    {
        AssetKind.Industrial => "IndustrialAsset", AssetKind.Compute => "ComputeAsset",
        AssetKind.Network => "NetworkAsset", AssetKind.Cloud => "CloudResource",
        AssetKind.Storage => "StorageAsset", AssetKind.Application => "ApplicationAsset",
        AssetKind.Security => "SecurityAsset", _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    private static bool TryKind(string kind, out AssetKind result)
    {
        foreach (var value in Enum.GetValues<AssetKind>())
            if (KindName(value) == kind) { result = value; return true; }
        result = default;
        return false;
    }

    internal sealed record OrgRef(Guid Id, string Slug, string Name);
    internal sealed record SiteRef(Guid Id, string Code, string Name, string Environment);
    internal sealed record ZoneRef(Guid Id, string Name);
    internal sealed record AssetContext(OrgRef Organization, string Region, SiteRef Site, ZoneRef? Zone);
    internal sealed record StateView(string State);
    private sealed record HierarchyNodeView(string Id, string Level, string Name, string? Code,
        string? ParentId, int ChildCount, int AssetCount);
    internal sealed record FrontendAssetSummary(Guid Id, string Kind, string Name, string Tag,
        string? Manufacturer, string? Model, AssetContext Context, string Lifecycle,
        StateView Health, StateView Connectivity, string IdentityConfidence);
}
