using Microsoft.EntityFrameworkCore;
using Npgsql;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record AssetInput(Guid SiteId, Guid? ZoneId, AssetKind Kind, string Name,
    string? Manufacturer, string? Model, string? Serial, string? Firmware);
public sealed record AssetUpdate(long Version, Guid SiteId, Guid? ZoneId, AssetKind Kind, string Name,
    string? Manufacturer, string? Model, string? Serial, string? Firmware);
public sealed record RelationshipInput(Guid SourceAssetId, Guid TargetAssetId, RelationKind Kind);

public static class AssetEndpoints
{
    public static void MapAssetEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/assets", ListAssets);
        api.MapGet("/assets/{id:guid}", GetAsset);
        api.MapPost("/assets", CreateAsset);
        api.MapPut("/assets/{id:guid}", UpdateAsset);
        api.MapDelete("/assets/{id:guid}", DeleteAsset);
        api.MapPost("/relationships", CreateRelationship);
        api.MapGet("/assets/{id:guid}/relationships", ListRelationships);
    }

    private static async Task<IResult> ListAssets(Guid siteId, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.CanRead(http.User, siteId)) return Results.Forbid();
        return Results.Ok(await db.Assets.AsNoTracking().Where(x => x.SiteId == siteId).OrderBy(x => x.Name).Take(500).ToListAsync(ct));
    }

    private static async Task<IResult> GetAsset(Guid id, HttpContext http, WaylornDbContext db, AssetCache cache, CancellationToken ct)
    {
        var asset = await cache.GetAsync(db.OrganizationId, id);
        if (asset is null)
        {
            asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (asset is not null) await cache.SetAsync(asset);
        }
        if (asset is null || asset.Deleted) return Results.NotFound();
        return AccessPolicy.CanRead(http.User, asset.SiteId) ? Results.Ok(asset) : Results.Forbid();
    }

    private static async Task<IResult> CreateAsset(AssetInput input, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.CanEdit(http.User, input.SiteId)) return Results.Forbid();
        if (input.SiteId == Guid.Empty || !Valid(input.Name) || !ValidOptional(input.Manufacturer) ||
            !ValidOptional(input.Model) || !ValidOptional(input.Serial) || !ValidOptional(input.Firmware) ||
            !Enum.IsDefined(input.Kind)) return Results.BadRequest();
        var asset = new Asset
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = input.SiteId,
            ZoneId = input.ZoneId, Kind = input.Kind, Name = input.Name.Trim(),
            Manufacturer = input.Manufacturer, Model = input.Model, Serial = input.Serial,
            Firmware = input.Firmware, CreatedUtc = DateTimeOffset.UtcNow
        };
        db.Assets.Add(asset);
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "asset.create", "asset", asset.Id, asset.SiteId);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/assets/{asset.Id}", asset);
    }

    private static async Task<IResult> UpdateAsset(Guid id, AssetUpdate input, HttpContext http, WaylornDbContext db, AssetCache cache, CancellationToken ct)
    {
        var asset = await db.Assets.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (asset is null) return Results.NotFound();
        if (!AccessPolicy.CanEdit(http.User, asset.SiteId)) return Results.Forbid();
        if (input.SiteId != asset.SiteId) return Results.Problem(statusCode: 409, detail: "Site transfer requires a separate workflow.");
        if (asset.Version != input.Version) return Results.Conflict();
        if (!Valid(input.Name) || !ValidOptional(input.Manufacturer) || !ValidOptional(input.Model) ||
            !ValidOptional(input.Serial) || !ValidOptional(input.Firmware) || !Enum.IsDefined(input.Kind))
            return Results.BadRequest();
        asset.ZoneId = input.ZoneId;
        asset.Kind = input.Kind;
        asset.Name = input.Name.Trim();
        asset.Manufacturer = input.Manufacturer;
        asset.Model = input.Model;
        asset.Serial = input.Serial;
        asset.Firmware = input.Firmware;
        asset.Version++;
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "asset.update", "asset", id, asset.SiteId);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        await cache.InvalidateAsync(db.OrganizationId, id);
        return Results.Ok(asset);
    }

    private static async Task<IResult> DeleteAsset(Guid id, long version, HttpContext http, WaylornDbContext db, AssetCache cache, CancellationToken ct)
    {
        var asset = await db.Assets.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (asset is null) return Results.NotFound();
        if (!AccessPolicy.CanEdit(http.User, asset.SiteId)) return Results.Forbid();
        if (asset.Version != version) return Results.Conflict();
        if (await db.Relationships.AnyAsync(x => x.SourceAssetId == id || x.TargetAssetId == id, ct) ||
            await db.Commands.AnyAsync(x => x.AssetId == id, ct))
            return Results.Problem(statusCode: 409, detail: "Asset has active references.");
        asset.Deleted = true;
        asset.Version++;
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "asset.delete", "asset", id, asset.SiteId);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        await cache.InvalidateAsync(db.OrganizationId, id);
        return Results.NoContent();
    }

    private static async Task<IResult> CreateRelationship(RelationshipInput input, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (input.SourceAssetId == input.TargetAssetId || !Enum.IsDefined(input.Kind)) return Results.BadRequest();
        var assets = await db.Assets.Where(x => x.Id == input.SourceAssetId || x.Id == input.TargetAssetId).ToListAsync(ct);
        if (assets.Count != 2) return Results.NotFound();
        if (assets.Any(x => !AccessPolicy.CanEdit(http.User, x.SiteId))) return Results.Forbid();
        var relation = new AssetRelation
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SourceAssetId = input.SourceAssetId,
            TargetAssetId = input.TargetAssetId, Kind = input.Kind, CreatedUtc = DateTimeOffset.UtcNow
        };
        db.Relationships.Add(relation);
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "relationship.create", "relationship", relation.Id, assets[0].SiteId);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { return Results.Conflict(); }
        return Results.Created($"/api/v1/assets/{input.SourceAssetId}/relationships", relation);
    }

    private static async Task<IResult> ListRelationships(Guid id, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (asset is null) return Results.NotFound();
        if (!AccessPolicy.CanRead(http.User, asset.SiteId)) return Results.Forbid();
        var siteIds = http.User.FindAll("site_id").Select(x => x.Value).Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        var allowedAssets = http.User.FindAll("site_id").Any(x => x.Value == "*")
            ? db.Assets.Select(x => x.Id)
            : db.Assets.Where(x => siteIds.Contains(x.SiteId)).Select(x => x.Id);
        var relations = await db.Relationships.AsNoTracking()
            .Where(x => (x.SourceAssetId == id || x.TargetAssetId == id) &&
                allowedAssets.Contains(x.SourceAssetId) && allowedAssets.Contains(x.TargetAssetId))
            .Take(500).ToListAsync(ct);
        return Results.Ok(relations);
    }

    private static bool Valid(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 200;
    private static bool ValidOptional(string? value) => value is null || value.Length <= 200;
}
