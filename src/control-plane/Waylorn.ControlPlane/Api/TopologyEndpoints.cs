using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class TopologyEndpoints
{
    private const int EdgeBatchLimit = 2000;
    private const int ImpactNodeLimit = 300;
    private static readonly RelationKind[] DependencyRelations = [RelationKind.DependsOn, RelationKind.HostedOn];

    public static void MapTopologyEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/orgs/{orgId:guid}/topology/neighborhood", Neighborhood);
        api.MapGet("/orgs/{orgId:guid}/topology/impact", Impact);
    }

    private static async Task<IResult> Neighborhood(Guid orgId, Guid focus, int? depth, int? nodeLimit,
        string? relations, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (orgId != db.OrganizationId || orgId == Guid.Empty) return Results.NotFound();
        var maxDepth = depth ?? 2;
        var maxNodes = nodeLimit ?? 150;
        if (maxDepth is < 1 or > 4 || maxNodes is < 10 or > 300 ||
            !TryRelations(relations, out var kinds)) return Results.BadRequest();
        var root = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == focus, ct);
        if (root is null || !AccessPolicy.CanRead(http.User, root.SiteId)) return Results.NotFound();

        var nodes = new Dictionary<Guid, (Asset Asset, int Distance)> { [focus] = (root, 0) };
        var edges = new Dictionary<Guid, AssetRelation>();
        var hidden = new Dictionary<(Guid AttachedTo, RelationKind Kind), int>();
        var frontier = new[] { focus };
        var truncated = false;
        for (var hop = 1; hop <= maxDepth && frontier.Length > 0; hop++)
        {
            var batch = await db.Relationships.AsNoTracking()
                .Where(x => kinds.Contains(x.Kind) &&
                    (frontier.Contains(x.SourceAssetId) || frontier.Contains(x.TargetAssetId)))
                .OrderBy(x => x.Id).Take(EdgeBatchLimit + 1).ToListAsync(ct);
            if (batch.Count > EdgeBatchLimit) { truncated = true; batch.RemoveAt(batch.Count - 1); }
            var candidateIds = batch.SelectMany(x => new[] { x.SourceAssetId, x.TargetAssetId })
                .Distinct().Where(x => !nodes.ContainsKey(x)).ToArray();
            var candidates = await db.Assets.AsNoTracking().Where(x => candidateIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);
            var next = new List<Guid>();
            foreach (var relation in batch)
            {
                var sourceKnown = nodes.ContainsKey(relation.SourceAssetId);
                var targetKnown = nodes.ContainsKey(relation.TargetAssetId);
                if (!sourceKnown && !targetKnown) continue;
                var otherId = sourceKnown ? relation.TargetAssetId : relation.SourceAssetId;
                if (!nodes.ContainsKey(otherId))
                {
                    if (!candidates.TryGetValue(otherId, out var candidate) ||
                        !AccessPolicy.CanRead(http.User, candidate.SiteId)) continue;
                    if (nodes.Count == maxNodes)
                    {
                        truncated = true;
                        var attached = sourceKnown ? relation.SourceAssetId : relation.TargetAssetId;
                        var key = (attached, relation.Kind);
                        hidden[key] = hidden.GetValueOrDefault(key) + 1;
                        continue;
                    }
                    nodes.Add(otherId, (candidate, hop));
                    next.Add(otherId);
                }
                if (nodes.ContainsKey(relation.SourceAssetId) && nodes.ContainsKey(relation.TargetAssetId))
                    edges.TryAdd(relation.Id, relation);
            }
            frontier = next.Distinct().ToArray();
        }
        var sites = await db.Sites.AsNoTracking().Where(x => nodes.Values.Select(n => n.Asset.SiteId).Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, ct);
        var items = nodes.Values.Select(x => Node(x.Asset, x.Distance,
            hidden.Where(h => h.Key.AttachedTo == x.Asset.Id).Sum(h => h.Value),
            sites.GetValueOrDefault(x.Asset.SiteId))).ToArray();
        var clusters = hidden.Select(x => new
        {
            id = $"hidden-{x.Key.AttachedTo:N}-{x.Key.Kind}", label = "Additional linked assets",
            grouping = "kind", memberCount = x.Value, attachedTo = x.Key.AttachedTo,
            relation = RelationName(x.Key.Kind),
            healthCounts = new { ok = 0, warning = 0, fault = 0, unknown = x.Value }
        }).ToArray();
        return Results.Ok(new { focusId = focus, depth = maxDepth, nodes = items,
            edges = edges.Values.Select(Edge).ToArray(), clusters, truncated, computedAt = DateTimeOffset.UtcNow });
    }

    private static async Task<IResult> Impact(Guid orgId, Guid assetId, string direction,
        HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (orgId != db.OrganizationId || orgId == Guid.Empty) return Results.NotFound();
        if (direction is not ("upstream" or "downstream")) return Results.BadRequest();
        var root = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == assetId, ct);
        if (root is null || !AccessPolicy.CanRead(http.User, root.SiteId)) return Results.NotFound();
        var visited = new HashSet<Guid> { assetId };
        var paths = new Dictionary<Guid, (Asset Asset, int Distance, string[] Path)>();
        var frontier = new[] { assetId };
        var truncated = false;
        for (var hop = 1; hop <= 8 && frontier.Length > 0; hop++)
        {
            var query = db.Relationships.AsNoTracking().Where(x => DependencyRelations.Contains(x.Kind));
            query = direction == "upstream" ? query.Where(x => frontier.Contains(x.SourceAssetId))
                : query.Where(x => frontier.Contains(x.TargetAssetId));
            var batch = await query.OrderBy(x => x.Id).Take(EdgeBatchLimit + 1).ToListAsync(ct);
            if (batch.Count > EdgeBatchLimit) { truncated = true; batch.RemoveAt(batch.Count - 1); }
            var candidateIds = batch.Select(x => direction == "upstream" ? x.TargetAssetId : x.SourceAssetId)
                .Distinct().Where(x => !visited.Contains(x)).ToArray();
            var candidates = await db.Assets.AsNoTracking().Where(x => candidateIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);
            var next = new List<Guid>();
            foreach (var relation in batch)
            {
                var from = direction == "upstream" ? relation.SourceAssetId : relation.TargetAssetId;
                var to = direction == "upstream" ? relation.TargetAssetId : relation.SourceAssetId;
                if (visited.Contains(to) || !candidates.TryGetValue(to, out var asset) ||
                    !AccessPolicy.CanRead(http.User, asset.SiteId)) continue;
                if (visited.Count == ImpactNodeLimit) { truncated = true; continue; }
                visited.Add(to);
                var parent = from == assetId ? [] : paths[from].Path;
                paths.Add(to, (asset, hop, [.. parent, relation.Id.ToString()]));
                next.Add(to);
            }
            frontier = next.ToArray();
            if (hop == 8 && frontier.Length > 0) truncated = true;
        }
        var sites = await db.Sites.AsNoTracking().Where(x => paths.Values.Select(p => p.Asset.SiteId).Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, ct);
        var affected = paths.Values.Select(x => new { node = Node(x.Asset, x.Distance, 0,
            sites.GetValueOrDefault(x.Asset.SiteId)), distance = x.Distance, path = x.Path }).ToArray();
        return Results.Ok(new { rootId = assetId, direction,
            relations = DependencyRelations.Select(RelationName).ToArray(), affected,
            computedAt = DateTimeOffset.UtcNow, truncated });
    }

    private static bool TryRelations(string? raw, out RelationKind[] kinds)
    {
        if (string.IsNullOrWhiteSpace(raw)) { kinds = Enum.GetValues<RelationKind>(); return true; }
        var names = raw.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        kinds = Enum.GetValues<RelationKind>().Where(x => names.Contains(RelationName(x))).ToArray();
        return names.Length > 0 && names.Length == kinds.Length;
    }

    private static object Node(Asset asset, int distance, int hiddenNeighborCount, string? siteCode) => new
    {
        asset.Id, kind = FrontendEndpoints.KindName(asset.Kind), asset.Name,
        tag = $"UNASSIGNED-{asset.Id:N}", health = "unknown", siteCode,
        distance, hiddenNeighborCount
    };

    private static object Edge(AssetRelation relation) => new
    {
        relation.Id, source = relation.SourceAssetId, target = relation.TargetAssetId,
        relation = RelationName(relation.Kind), provenance = "declared"
    };

    private static string RelationName(RelationKind kind) => kind switch
    {
        RelationKind.ConnectedTo => "CONNECTED_TO", RelationKind.DependsOn => "DEPENDS_ON",
        RelationKind.ProgrammedBy => "PROGRAMMED_BY", RelationKind.MonitoredBy => "MONITORED_BY",
        RelationKind.HostedOn => "HOSTED_ON", RelationKind.SendsDataTo => "SENDS_DATA_TO",
        RelationKind.RepresentedBy => "REPRESENTED_BY", RelationKind.ProtectedBy => "PROTECTED_BY",
        _ => "CONTROLS"
    };
}
