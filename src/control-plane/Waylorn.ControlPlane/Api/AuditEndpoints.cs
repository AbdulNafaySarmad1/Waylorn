using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class AuditEndpoints
{
    public static void MapAuditEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/audit", ListAudit);
        api.MapGet("/audit/{id:guid}", GetAudit);
    }

    private static async Task<IResult> ListAudit(Guid? siteId, Guid? targetId, string? cursor, int? limit,
        HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.HasRole(http.User, "Administrator") || db.OrganizationId == Guid.Empty)
            return Results.Forbid();
        if (limit is < 1 or > 100) return Results.BadRequest();
        if (siteId is { } site && !AccessPolicy.HasSite(http.User, site)) return Results.Forbid();
        var wildcard = http.User.FindAll("site_id").Any(x => x.Value == "*");
        var allowedSites = http.User.FindAll("site_id").Select(x => x.Value)
            .Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        if (!wildcard && allowedSites.Length == 0) return Results.Forbid();

        IQueryable<AuditRecord> query = db.Audit.AsNoTracking();
        if (siteId is { } selected) query = query.Where(x => x.SiteId == selected);
        else if (!wildcard) query = query.Where(x => x.SiteId != null && allowedSites.Contains(x.SiteId.Value));
        if (targetId is { } target) query = query.Where(x => x.TargetId == target);
        if (!string.IsNullOrEmpty(cursor))
        {
            var parts = cursor.Split('.', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks) ||
                !Guid.TryParseExact(parts[1], "N", out var beforeId) ||
                ticks < DateTimeOffset.MinValue.UtcTicks || ticks > DateTimeOffset.MaxValue.UtcTicks)
                return Results.BadRequest();
            var beforeAt = new DateTimeOffset(ticks, TimeSpan.Zero);
            query = query.Where(x => x.AtUtc < beforeAt ||
                (x.AtUtc == beforeAt && x.Id.CompareTo(beforeId) < 0));
        }
        var size = limit ?? 50;
        var rows = await query.OrderByDescending(x => x.AtUtc).ThenByDescending(x => x.Id)
            .Take(size + 1).ToListAsync(ct);
        var items = rows.Take(size).ToArray();
        var last = items.LastOrDefault();
        var nextCursor = rows.Count > size && last is not null ? $"{last.AtUtc.UtcTicks}.{last.Id:N}" : null;
        return Results.Ok(new { items, nextCursor });
    }

    private static async Task<IResult> GetAudit(Guid id, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.HasRole(http.User, "Administrator") || db.OrganizationId == Guid.Empty)
            return Results.Forbid();
        var row = await db.Audit.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return Results.NotFound();
        return row.SiteId is { } site && AccessPolicy.HasSite(http.User, site) ||
            row.SiteId is null && http.User.FindAll("site_id").Any(x => x.Value == "*")
            ? Results.Ok(row) : Results.Forbid();
    }
}
