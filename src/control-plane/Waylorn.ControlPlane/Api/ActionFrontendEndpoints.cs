using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class ActionFrontendEndpoints
{
    public static void MapActionFrontendEndpoints(this RouteGroupBuilder api) =>
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/actions", List);

    private static async Task<IResult> List(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == assetId, ct);
        if (asset is null || !AccessPolicy.CanRead(http.User, asset.SiteId)) return Results.NotFound();
        // The approval ledger does not dispatch to OT. No executable action is available.
        return Results.Ok(new { items = Array.Empty<object>() });
    }
}
