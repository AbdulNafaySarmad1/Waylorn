using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class ObservationEndpoints
{
    public static void MapObservationEndpoints(this RouteGroupBuilder api) =>
        api.MapPost("/observations", Ingest);

    private static async Task<IResult> Ingest(ObservationBatch input, HttpContext http, IConfiguration config,
        WaylornDbContext db, CancellationToken ct)
    {
        if (!config.GetValue("Telemetry:AcceptRawObservations", false))
            return Results.Problem(statusCode: 503, detail: "Raw telemetry ingestion is disabled at this control plane.");
        // An agent credential is scoped to exactly one site; wildcard human tokens cannot ingest.
        if (!AccessPolicy.HasRole(http.User, "SiteAgent") ||
            http.User.FindFirstValue("principal_type") != "workload" ||
            !http.User.FindAll("site_id").Any(x => x.Value == input.SiteId.ToString()))
            return Results.Forbid();

        var now = DateTimeOffset.UtcNow;
        if (input.SchemaVersion != 1 || input.RequestId == Guid.Empty || input.SiteId == Guid.Empty || input.AssetId == Guid.Empty ||
            input.Source is not { Length: > 0 and <= 120 } ||
            input.ObservedUtc < now - TelemetryPolicy.Retention || input.ObservedUtc > now.AddMinutes(2) ||
            input.ExpectedIntervalMs is < 250 or > 3_600_000 ||
            input.Values is not { Length: > 0 and <= 125 } ||
            input.Values.Any(x => x is null || x.SignalKey is not { Length: > 0 and <= 80 } ||
                !x.SignalKey.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or ':' or '-') ||
                x.Value is < 0 or > ushort.MaxValue) ||
            input.Values.Select(x => x.SignalKey).Distinct(StringComparer.Ordinal).Count() != input.Values.Length)
            return Results.BadRequest();

        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.AssetId, ct);
        if (asset is null || asset.SiteId != input.SiteId || asset.Kind != AssetKind.Industrial)
            return Results.NotFound();

        var existing = await db.Telemetry.AsNoTracking().Where(x => x.RequestId == input.RequestId).ToListAsync(ct);
        if (existing.Count > 0)
        {
            var same = existing.Count == input.Values.Length && existing.All(sample =>
                sample.SiteId == input.SiteId && sample.AssetId == input.AssetId &&
                sample.Source == input.Source && sample.ObservedUtc == input.ObservedUtc.UtcDateTime &&
                sample.ExpectedIntervalMs == input.ExpectedIntervalMs &&
                input.Values.Any(x => x.SignalKey == sample.SignalKey && x.Value == sample.Value));
            return same ? Results.Ok(new { input.RequestId, count = existing.Count, duplicate = true }) :
                Results.Conflict(new { detail = "Request ID has already been used for different observations." });
        }

        db.Telemetry.AddRange(input.Values.Select(value => new TelemetrySample
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = input.SiteId,
            AssetId = input.AssetId, RequestId = input.RequestId,
            SignalKey = value.SignalKey, Value = value.Value, Source = input.Source,
            ObservedUtc = input.ObservedUtc.UtcDateTime, ReceivedUtc = now.UtcDateTime,
            ExpectedIntervalMs = input.ExpectedIntervalMs
        }));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Results.Conflict(new { detail = "Observation request already exists." }); }
        return Results.Accepted(value: new { input.RequestId, count = input.Values.Length });
    }

    public sealed record ObservationBatch(int SchemaVersion, Guid RequestId, Guid SiteId, Guid AssetId, string Source,
        DateTimeOffset ObservedUtc, int ExpectedIntervalMs, RegisterSample[] Values);
    public sealed record RegisterSample(string SignalKey, int Value);
}
