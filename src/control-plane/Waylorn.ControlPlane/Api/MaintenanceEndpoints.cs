using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record WorkOrderInput(Guid AssetId, string Title, WorkOrderType Type, DateTimeOffset? DueUtc);
public sealed record WorkOrderTransitionInput(WorkOrderState State, long Version);

public static class MaintenanceEndpoints
{
    public static void MapMaintenanceEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/work-orders", Create);
        api.MapGet("/work-orders/{id:guid}", Get);
        api.MapPatch("/work-orders/{id:guid}", Transition);
    }

    public static void MapMaintenanceFrontendEndpoints(this RouteGroupBuilder api) =>
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/maintenance", ListForAsset);

    private static async Task<IResult> Create(WorkOrderInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (input.AssetId == Guid.Empty || input.Title is not { Length: > 0 and <= 200 } ||
            string.IsNullOrWhiteSpace(input.Title) || !Enum.IsDefined(input.Type))
            return Results.BadRequest();
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.AssetId, ct);
        if (asset is null) return Results.NotFound();
        var actor = AccessPolicy.Subject(http.User);
        if (!AccessPolicy.CanRequest(http.User, asset.SiteId) || actor.Length == 0)
        {
            AuditWriter.Add(db, actor, "maintenance.create", "asset", asset.Id, asset.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        var now = DateTime.UtcNow;
        var order = new MaintenanceWorkOrder
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId,
            SiteId = asset.SiteId, AssetId = asset.Id, Title = input.Title.Trim(),
            Type = input.Type, State = WorkOrderState.Planned, DueUtc = input.DueUtc?.UtcDateTime,
            CreatedBy = actor, CreatedUtc = now, UpdatedUtc = now
        };
        db.WorkOrders.Add(order);
        AuditWriter.Add(db, actor, "maintenance.create", "work-order", order.Id, asset.SiteId);
        OperationalEventWriter.Add(db, asset.SiteId, "work-order-created", order.Id, "planned", actor);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/work-orders/{order.Id}", order);
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        var order = await db.WorkOrders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return order is not null && AccessPolicy.CanRead(http.User, order.SiteId)
            ? Results.Ok(order) : Results.NotFound();
    }

    private static async Task<IResult> Transition(Guid id, WorkOrderTransitionInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        var order = await db.WorkOrders.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return Results.NotFound();
        var actor = AccessPolicy.Subject(http.User);
        if (!AccessPolicy.CanRequest(http.User, order.SiteId) || actor.Length == 0)
        {
            AuditWriter.Add(db, actor, "maintenance.transition", "work-order", id, order.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        if (input.Version != order.Version || !IsNext(order.State, input.State)) return Results.Conflict();
        order.State = input.State;
        order.UpdatedUtc = DateTime.UtcNow;
        if (input.State == WorkOrderState.Completed) order.CompletedUtc = order.UpdatedUtc;
        order.Version++;
        AuditWriter.Add(db, actor, "maintenance.transition", "work-order", id, order.SiteId);
        OperationalEventWriter.Add(db, order.SiteId, "work-order-updated", id,
            StateName(input.State), actor);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        return Results.Ok(order);
    }

    private static async Task<IResult> ListForAsset(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == assetId, ct);
        if (asset is null || !AccessPolicy.CanRead(http.User, asset.SiteId)) return Results.NotFound();
        var rows = await db.WorkOrders.AsNoTracking().Where(x => x.AssetId == assetId)
            .OrderByDescending(x => x.CreatedUtc).Take(101).ToListAsync(ct);
        if (rows.Count > 100) return Results.Problem(statusCode: 413, detail: "Too many work orders for this view.");
        return Results.Ok(new { items = rows.Select(x => new
        {
            x.Id, x.Title, type = x.Type.ToString().ToLowerInvariant(),
            status = StateName(x.State), dueAt = x.DueUtc, completedAt = x.CompletedUtc,
            system = "Waylorn"
        }) });
    }

    private static string StateName(WorkOrderState state) => state == WorkOrderState.InProgress
        ? "in_progress" : state.ToString().ToLowerInvariant();

    private static bool IsNext(WorkOrderState current, WorkOrderState next) =>
        (current, next) is (WorkOrderState.Planned, WorkOrderState.Scheduled) or
            (WorkOrderState.Scheduled, WorkOrderState.InProgress) or
            (WorkOrderState.InProgress, WorkOrderState.Completed) or
            (WorkOrderState.Planned, WorkOrderState.Cancelled) or
            (WorkOrderState.Scheduled, WorkOrderState.Cancelled);
}
