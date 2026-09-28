using System.Net;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record DiscoveryClaimInput(int SchemaVersion, Guid SiteId, string Endpoint, int UnitId,
    string VendorName, string ProductCode, string Revision);
public sealed record ReconcileInput(string Action, long Version, Guid? AssetId, string? Name, AssetKind? Kind);

// Discovery and reconciliation (ADR 0036). Agents only identify endpoints they are configured to read;
// identity is matched on reported vendor and product, never on network address, and only proposed.
public static class DiscoveryEndpoints
{
    public static void MapDiscoveryEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/discovery/claims", Report).RequireRateLimiting("site-heartbeat");
        api.MapGet("/discovery/claims", List);
        api.MapPost("/discovery/claims/{id:guid}/reconcile", Reconcile);
    }

    // Same rule the Rust reader applies: printable ASCII without quote or backslash.
    private static bool Text(string? value) =>
        value is { Length: > 0 and <= 64 } && value.All(c => c is >= ' ' and <= '~' and not '"' and not '\\');

    private static async Task<IResult> Report(DiscoveryClaimInput input, HttpContext http, WaylornDbContext db,
        CancellationToken ct)
    {
        if (input.SchemaVersion != 1 || input.SiteId == Guid.Empty || input.UnitId is < 0 or > 255 ||
            input.Endpoint is not { Length: <= 64 } || !IPEndPoint.TryParse(input.Endpoint, out _) ||
            !Text(input.VendorName) || !Text(input.ProductCode) || !Text(input.Revision))
            return Results.BadRequest();
        var subject = AccessPolicy.Subject(http.User);
        var siteClaims = http.User.FindAll("site_id").ToArray();
        if (!AccessPolicy.HasRole(http.User, "SiteAgent") || http.User.FindFirstValue("principal_type") != "workload" ||
            siteClaims.Length != 1 || !Guid.TryParse(siteClaims[0].Value, out var allowedSite) ||
            allowedSite != input.SiteId || subject.Length is < 1 or > 200)
            return Results.Forbid();
        if (!await db.Sites.AnyAsync(x => x.Id == input.SiteId, ct)) return Results.NotFound();

        var now = DateTime.UtcNow;
        var claim = await db.DiscoveryClaims.SingleOrDefaultAsync(x => x.SiteId == input.SiteId &&
            x.Source == subject && x.Endpoint == input.Endpoint && x.UnitId == input.UnitId, ct);
        var changed = claim is null || claim.VendorName != input.VendorName ||
            claim.ProductCode != input.ProductCode || claim.Revision != input.Revision;
        if (claim is null)
        {
            claim = new DiscoveryClaim
            {
                Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = input.SiteId, Source = subject,
                Endpoint = input.Endpoint, UnitId = input.UnitId, FirstSeenUtc = now
            };
            db.DiscoveryClaims.Add(claim);
        }
        claim.LastSeenUtc = now;
        if (changed)
        {
            claim.VendorName = input.VendorName;
            claim.ProductCode = input.ProductCode;
            claim.Revision = input.Revision;
            // A linked device that reports a different identity (e.g. new firmware) goes back to review.
            claim.State = DiscoveryClaimState.Pending;
            var matches = await db.Assets.AsNoTracking().Where(x => x.SiteId == input.SiteId &&
                x.Manufacturer == input.VendorName && x.Model == input.ProductCode)
                .Select(x => x.Id).Take(2).ToListAsync(ct);
            claim.CandidateAssetId = claim.AssetId ?? (matches.Count == 1 ? matches[0] : null);
            claim.Version++;
            AuditWriter.Add(db, subject, "discovery.claim", "discovery-claim", claim.Id, claim.SiteId);
        }
        // A concurrent report or review wins; the agent reports again on its next identification.
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation }) { return Results.Conflict(); }
        return Results.Accepted(value: new { claim.Id, state = claim.State, claim.CandidateAssetId });
    }

    private static async Task<IResult> List(Guid siteId, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        if (!AccessPolicy.CanRead(http.User, siteId)) return Results.Forbid();
        return Results.Ok(new
        {
            items = await db.DiscoveryClaims.AsNoTracking().Where(x => x.SiteId == siteId)
                .OrderByDescending(x => x.LastSeenUtc).Take(500).ToListAsync(ct)
        });
    }

    private static async Task<IResult> Reconcile(Guid id, ReconcileInput input, HttpContext http, WaylornDbContext db,
        CancellationToken ct)
    {
        var claim = await db.DiscoveryClaims.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (claim is null) return Results.NotFound();
        if (!AccessPolicy.CanEdit(http.User, claim.SiteId) || http.User.FindFirstValue("principal_type") != "human")
            return Results.Forbid();
        if (claim.Version != input.Version) return Results.Conflict();
        Asset? asset = null;
        switch (input.Action)
        {
            case "link":
                asset = await db.Assets.SingleOrDefaultAsync(x => x.Id == input.AssetId && x.SiteId == claim.SiteId, ct);
                if (asset is null) return Results.BadRequest();
                asset.Version++;
                break;
            case "create":
                if (input.Name is not { Length: > 0 and <= 200 } || input.Kind is { } kind && !Enum.IsDefined(kind))
                    return Results.BadRequest();
                asset = new Asset
                {
                    Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = claim.SiteId,
                    Kind = input.Kind ?? AssetKind.Industrial, Name = input.Name.Trim(), CreatedUtc = DateTimeOffset.UtcNow
                };
                db.Assets.Add(asset);
                break;
            case "reject":
                break;
            default:
                return Results.BadRequest();
        }
        var subject = AccessPolicy.Subject(http.User);
        if (asset is not null)
        {
            // Accepting the claim makes its reported identity the reviewed inventory record.
            asset.Manufacturer = claim.VendorName;
            asset.Model = claim.ProductCode;
            asset.Firmware = claim.Revision;
            claim.AssetId = asset.Id;
            AuditWriter.Add(db, subject, input.Action == "create" ? "asset.create" : "asset.update", "asset",
                asset.Id, asset.SiteId);
        }
        claim.State = asset is null ? DiscoveryClaimState.Rejected : DiscoveryClaimState.Linked;
        claim.ReviewedBy = subject;
        claim.Version++;
        AuditWriter.Add(db, subject, $"discovery.{input.Action}", "discovery-claim", claim.Id, claim.SiteId);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
        return Results.Ok(claim);
    }
}
