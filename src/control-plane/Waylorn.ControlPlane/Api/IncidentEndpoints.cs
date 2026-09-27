using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record IncidentInput(Guid SiteId, Guid[] AssetIds, string Title,
    IncidentSeverity Severity, string? Owner);
public sealed record IncidentTransitionInput(IncidentState State, long Version, string? Owner);

public static class IncidentEndpoints
{
    public static void MapIncidentEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/incidents", Create);
        api.MapGet("/incidents/{id:guid}", Get);
        api.MapPatch("/incidents/{id:guid}", Transition);
    }

    private static async Task<IResult> Create(IncidentInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        var actor = AccessPolicy.Subject(http.User);
        if (!AccessPolicy.CanRequest(http.User, input.SiteId) || actor.Length == 0)
        {
            AuditWriter.Add(db, actor, "incident.open", "site", input.SiteId, input.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        if (input.SiteId == Guid.Empty || input.AssetIds is not { Length: > 0 and <= 50 } ||
            input.AssetIds.Any(x => x == Guid.Empty) || input.AssetIds.Distinct().Count() != input.AssetIds.Length ||
            input.Title is not { Length: > 0 and <= 200 } || string.IsNullOrWhiteSpace(input.Title) ||
            input.Owner?.Length > 200 || !Enum.IsDefined(input.Severity)) return Results.BadRequest();
        var assets = await db.Assets.AsNoTracking().Where(x => input.AssetIds.Contains(x.Id)).ToListAsync(ct);
        if (assets.Count != input.AssetIds.Length || assets.Any(x => x.SiteId != input.SiteId))
            return Results.NotFound();
        var now = DateTime.UtcNow;
        var incident = new Incident
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = input.SiteId,
            PrimaryAssetId = input.AssetIds[0], Title = input.Title.Trim(),
            Severity = input.Severity, State = IncidentState.Open, OpenedBy = actor,
            Owner = string.IsNullOrWhiteSpace(input.Owner) ? null : input.Owner.Trim(),
            OpenedUtc = now, UpdatedUtc = now
        };
        db.Incidents.Add(incident);
        db.IncidentAssets.AddRange(input.AssetIds.Select(id => new IncidentAsset
        {
            OrganizationId = db.OrganizationId, IncidentId = incident.Id, AssetId = id
        }));
        AuditWriter.Add(db, actor, "incident.open", "incident", incident.Id, input.SiteId);
        OperationalEventWriter.Add(db, input.SiteId, "incident-opened", incident.Id, "open", actor);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/incidents/{incident.Id}", incident);
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        var incident = await db.Incidents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (incident is null || !AccessPolicy.CanRead(http.User, incident.SiteId)) return Results.NotFound();
        var assetIds = await db.IncidentAssets.AsNoTracking().Where(x => x.IncidentId == id)
            .Select(x => x.AssetId).ToArrayAsync(ct);
        return Results.Ok(new { incident.Id, incident.SiteId, incident.PrimaryAssetId,
            assetIds, incident.Title, incident.Severity, incident.State,
            incident.Owner, incident.OpenedBy, incident.OpenedUtc, incident.UpdatedUtc, incident.Version });
    }

    private static async Task<IResult> Transition(Guid id, IncidentTransitionInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        var incident = await db.Incidents.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (incident is null) return Results.NotFound();
        var actor = AccessPolicy.Subject(http.User);
        if (!AccessPolicy.CanRequest(http.User, incident.SiteId) || actor.Length == 0)
        {
            AuditWriter.Add(db, actor, "incident.transition", "incident", id, incident.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        if (input.Version != incident.Version || input.Owner?.Length > 200 ||
            !IsNext(incident.State, input.State)) return Results.Conflict();
        incident.State = input.State;
        if (input.Owner is not null) incident.Owner = string.IsNullOrWhiteSpace(input.Owner) ? null : input.Owner.Trim();
        incident.UpdatedUtc = DateTime.UtcNow;
        incident.Version++;
        AuditWriter.Add(db, actor, "incident.transition", "incident", id, incident.SiteId);
        OperationalEventWriter.Add(db, incident.SiteId, "incident-updated", id,
            input.State.ToString().ToLowerInvariant(), actor);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        return Results.Ok(incident);
    }

    private static bool IsNext(IncidentState current, IncidentState next) =>
        (current, next) is (IncidentState.Open, IncidentState.Acknowledged) or
            (IncidentState.Acknowledged, IncidentState.Mitigated) or
            (IncidentState.Mitigated, IncidentState.Resolved);
}
