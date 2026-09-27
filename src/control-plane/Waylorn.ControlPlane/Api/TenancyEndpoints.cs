using Microsoft.EntityFrameworkCore;
using Npgsql;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record OrganizationInput(string Slug, string Name);
public sealed record SiteInput(Guid Id, string Code, string Name, string RegionName, string Timezone, string Environment);
public sealed record ZoneInput(Guid Id, string Code, string Name);

public static class TenancyEndpoints
{
    public static void MapTenancyEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/organization", GetOrganization);
        api.MapPost("/organization", CreateOrganization);
        api.MapGet("/sites", ListSites);
        api.MapPost("/sites", CreateSite);
        api.MapGet("/sites/{siteId:guid}/zones", ListZones);
        api.MapPost("/sites/{siteId:guid}/zones", CreateZone);
    }

    private static async Task<IResult> GetOrganization(HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (db.OrganizationId == Guid.Empty) return Results.Forbid();
        var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        return organization is null ? Results.NotFound() : Results.Ok(organization);
    }

    private static async Task<IResult> CreateOrganization(OrganizationInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (db.OrganizationId == Guid.Empty || !AccessPolicy.HasRole(http.User, "Administrator")) return Results.Forbid();
        if (!ValidSlug(input.Slug) || !ValidName(input.Name)) return Results.BadRequest();
        if (await db.Organizations.AnyAsync(ct)) return Results.Conflict();
        var organization = new Organization
        {
            Id = db.OrganizationId, OrganizationId = db.OrganizationId,
            Slug = input.Slug, Name = input.Name.Trim(), CreatedUtc = DateTimeOffset.UtcNow
        };
        db.Organizations.Add(organization);
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "organization.create", "organization", organization.Id, null);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { return Results.Conflict(); }
        return Results.Created("/api/v1/organization", organization);
    }

    private static async Task<IResult> ListSites(HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (db.OrganizationId == Guid.Empty) return Results.Forbid();
        var ids = http.User.FindAll("site_id").Select(x => x.Value)
            .Where(x => Guid.TryParse(x, out _)).Select(Guid.Parse).ToArray();
        var query = db.Sites.AsNoTracking();
        if (!http.User.FindAll("site_id").Any(x => x.Value == "*")) query = query.Where(x => ids.Contains(x.Id));
        return Results.Ok(await query.OrderBy(x => x.Code).Take(500).ToListAsync(ct));
    }

    private static async Task<IResult> CreateSite(SiteInput input, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.CanEdit(http.User, input.Id)) return Results.Forbid();
        if (input.Id == Guid.Empty || !ValidCode(input.Code) || !ValidName(input.Name) ||
            !ValidName(input.RegionName) || string.IsNullOrWhiteSpace(input.Timezone) ||
            input.Timezone.Length > 80 || input.Environment is not ("lab" or "staging" or "production"))
            return Results.BadRequest();
        if (!await db.Organizations.AnyAsync(ct)) return Results.Problem(statusCode: 409, detail: "Organization must be registered first.");
        if (await db.Sites.AnyAsync(x => x.Id == input.Id, ct)) return Results.Conflict();
        var site = new Site
        {
            Id = input.Id, OrganizationId = db.OrganizationId, Code = input.Code,
            Name = input.Name.Trim(), RegionName = input.RegionName.Trim(),
            Timezone = input.Timezone, Environment = input.Environment, CreatedUtc = DateTimeOffset.UtcNow
        };
        db.Sites.Add(site);
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "site.create", "site", site.Id, site.Id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { return Results.Conflict(); }
        return Results.Created($"/api/v1/sites/{site.Id}", site);
    }

    private static async Task<IResult> ListZones(Guid siteId, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.HasSite(http.User, siteId)) return Results.Forbid();
        if (!await db.Sites.AnyAsync(x => x.Id == siteId, ct)) return Results.NotFound();
        return Results.Ok(await db.Zones.AsNoTracking().Where(x => x.SiteId == siteId)
            .OrderBy(x => x.Code).Take(500).ToListAsync(ct));
    }

    private static async Task<IResult> CreateZone(Guid siteId, ZoneInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.CanEdit(http.User, siteId)) return Results.Forbid();
        if (input.Id == Guid.Empty || !ValidCode(input.Code) || !ValidName(input.Name)) return Results.BadRequest();
        if (!await db.Sites.AnyAsync(x => x.Id == siteId, ct)) return Results.NotFound();
        if (await db.Zones.AnyAsync(x => x.Id == input.Id, ct)) return Results.Conflict();
        var zone = new Zone
        {
            Id = input.Id, OrganizationId = db.OrganizationId, SiteId = siteId,
            Code = input.Code, Name = input.Name.Trim(), CreatedUtc = DateTimeOffset.UtcNow
        };
        db.Zones.Add(zone);
        AuditWriter.Add(db, AccessPolicy.Subject(http.User), "zone.create", "zone", zone.Id, siteId);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { return Results.Conflict(); }
        return Results.Created($"/api/v1/sites/{siteId}/zones", zone);
    }

    private static bool ValidName(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 200;
    private static bool ValidCode(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 40 &&
        value.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9' or '-');
    private static bool ValidSlug(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 80 &&
        (value[0] is >= 'a' and <= 'z') && (value[^1] is >= 'a' and <= 'z' or >= '0' and <= '9') &&
        value.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-');
}
