using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class OutboxStatusEndpoints
{
    public static void MapOutboxStatusEndpoints(this RouteGroupBuilder api) =>
        api.MapGet("/operations/outbox", Get);

    private static async Task<IResult> Get(HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.HasRole(http.User, "Administrator") || db.OrganizationId == Guid.Empty)
            return Results.Forbid();
        var claims = http.User.FindAll("site_id").Select(x => x.Value).ToArray();
        var wildcard = claims.Contains("*");
        var allowedSites = claims.Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        if (!wildcard && allowedSites.Length == 0) return Results.Forbid();

        var query = db.Outbox.AsNoTracking().Where(x => x.PublishedUtc == null);
        if (!wildcard) query = query.Where(x => x.SiteId != null && allowedSites.Contains(x.SiteId.Value));
        List<QueueStat> groups;
        if (db.Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite")
        {
            // SQLite is used only by HTTP tests and cannot aggregate DateTimeOffset.
            var rows = await query.Select(x => new { x.Destination, x.CreatedUtc, x.Attempts }).ToListAsync(ct);
            groups = rows.GroupBy(x => x.Destination)
                .Select(g => new QueueStat(g.Key, g.Count(), g.Count(x => x.Attempts > 0),
                    g.Min(x => x.CreatedUtc))).ToList();
        }
        else
        {
            groups = await query.GroupBy(x => x.Destination)
                .Select(g => new QueueStat(g.Key, g.Count(), g.Count(x => x.Attempts > 0),
                    g.Min(x => x.CreatedUtc))).ToListAsync(ct);
        }
        var byDestination = groups.ToDictionary(x => x.Destination);
        var items = Enum.GetValues<OutboxDestination>().Select(destination =>
        {
            var row = byDestination.GetValueOrDefault(destination);
            return new
            {
                destination,
                pending = row?.Pending ?? 0,
                retrying = row?.Retrying ?? 0,
                oldestPendingAt = row?.OldestPendingAt
            };
        });
        return Results.Ok(new { generatedAt = DateTimeOffset.UtcNow, items });
    }

    private sealed record QueueStat(OutboxDestination Destination, int Pending, int Retrying,
        DateTimeOffset OldestPendingAt);
}
