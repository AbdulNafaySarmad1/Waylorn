using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public static class TelemetryEndpoints
{
    public static void MapTelemetryEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/live", Snapshot);
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/live/stream", Stream);
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/telemetry/signals", Signals);
        api.MapGet("/orgs/{orgId:guid}/assets/{assetId:guid}/telemetry/series", Series);
    }

    private static async Task<IResult> Snapshot(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, TelemetryPolicy telemetry, CancellationToken ct)
    {
        if (!await VisibleAsset(orgId, assetId, http, db, ct)) return Results.NotFound();
        var cutoff = DateTime.UtcNow - telemetry.Retention;
        var samples = await db.Telemetry.AsNoTracking().Where(x => x.AssetId == assetId && x.ObservedUtc >= cutoff)
            .GroupBy(x => x.SignalKey)
            .Select(group => group.OrderByDescending(x => x.ObservedUtc).ThenByDescending(x => x.ReceivedUtc).First())
            .ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        return Results.Ok(new
        {
            assetId, serverTime = now,
            signals = samples.OrderBy(x => x.SignalKey).Select(x => new
            {
                key = x.SignalKey, label = x.SignalKey, value = x.Value,
                quality = x.ObservedUtc <= now.UtcDateTime &&
                    now.UtcDateTime - x.ObservedUtc <= TimeSpan.FromMilliseconds(2L * x.ExpectedIntervalMs)
                    ? "good" : "uncertain",
                observedAt = x.ObservedUtc, expectedIntervalMs = x.ExpectedIntervalMs, source = x.Source
            })
        });
    }

    private static async Task<IResult> Stream(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, TelemetryPolicy telemetry, CancellationToken ct)
    {
        if (!await VisibleAsset(orgId, assetId, http, db, ct)) return Results.NotFound();
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers["X-Accel-Buffering"] = "no";
        return Results.Stream(async body =>
        {
            var sent = new Dictionary<string, Guid>(StringComparer.Ordinal);
            var expires = DateTime.UtcNow.AddMinutes(4);
            while (!ct.IsCancellationRequested && DateTime.UtcNow < expires)
            {
                var now = DateTime.UtcNow;
                var cutoff = now - telemetry.Retention;
                var samples = await db.Telemetry.AsNoTracking()
                    .Where(x => x.AssetId == assetId && x.ObservedUtc >= cutoff)
                    .GroupBy(x => x.SignalKey)
                    .Select(group => group.OrderByDescending(x => x.ObservedUtc)
                        .ThenByDescending(x => x.ReceivedUtc).First())
                    .ToListAsync(ct);
                foreach (var sample in samples.OrderBy(x => x.SignalKey))
                {
                    if (sent.TryGetValue(sample.SignalKey, out var id) && id == sample.Id) continue;
                    var payload = JsonSerializer.Serialize(new
                    {
                        key = sample.SignalKey, label = sample.SignalKey, value = sample.Value,
                        quality = sample.ObservedUtc <= now &&
                            now - sample.ObservedUtc <= TimeSpan.FromMilliseconds(2L * sample.ExpectedIntervalMs)
                            ? "good" : "uncertain",
                        observedAt = sample.ObservedUtc, expectedIntervalMs = sample.ExpectedIntervalMs,
                        source = sample.Source
                    });
                    await body.WriteAsync(System.Text.Encoding.UTF8.GetBytes(
                        $"id: {sample.Id}\nevent: signal\ndata: {payload}\n\n"), ct);
                    sent[sample.SignalKey] = sample.Id;
                }
                await body.WriteAsync(System.Text.Encoding.UTF8.GetBytes(
                    $"event: heartbeat\ndata: {{\"serverTime\":\"{now:O}\"}}\n\n"), ct);
                await body.FlushAsync(ct);
                await Task.Delay(TimeSpan.FromSeconds(5), ct);
            }
        }, contentType: "text/event-stream");
    }

    private static async Task<IResult> Signals(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, TelemetryPolicy telemetry, CancellationToken ct)
    {
        if (!await VisibleAsset(orgId, assetId, http, db, ct)) return Results.NotFound();
        var cutoff = DateTime.UtcNow - telemetry.Retention;
        var keys = await db.Telemetry.AsNoTracking().Where(x => x.AssetId == assetId && x.ObservedUtc >= cutoff)
            .Select(x => x.SignalKey).Distinct().OrderBy(x => x).Take(201).ToListAsync(ct);
        if (keys.Count > 200) return Results.Problem(statusCode: 413, detail: "Asset has too many signals for this API.");
        return Results.Ok(new { items = keys.Select(key => new { key, label = key, retention = telemetry.IsoPeriod }) });
    }

    private static async Task<IResult> Series(Guid orgId, Guid assetId, string signal,
        DateTimeOffset from, DateTimeOffset to, int? maxPoints, HttpContext http,
        WaylornDbContext db, TelemetryPolicy telemetry, CancellationToken ct)
    {
        if (!await VisibleAsset(orgId, assetId, http, db, ct)) return Results.NotFound();
        if (string.IsNullOrWhiteSpace(signal) || signal.Length > 80 || from >= to ||
            from < DateTimeOffset.UtcNow - telemetry.Retention ||
            to > DateTimeOffset.UtcNow.AddMinutes(2) || to - from > telemetry.Retention ||
            maxPoints is < 10 or > 2000) return Results.BadRequest();
        var pointLimit = maxPoints ?? 600;
        var rows = await db.Telemetry.AsNoTracking()
            .Where(x => x.AssetId == assetId && x.SignalKey == signal &&
                x.ObservedUtc >= from.UtcDateTime && x.ObservedUtc < to.UtcDateTime)
            .OrderBy(x => x.ObservedUtc).Take(50_001).ToListAsync(ct);
        if (rows.Count > 50_000)
            return Results.Problem(statusCode: 413, detail: "Query contains too many raw samples; narrow the time range.");
        var resolution = Math.Max(1, (int)Math.Ceiling((to - from).TotalSeconds / pointLimit));
        var buckets = rows.GroupBy(x => (long)((x.ObservedUtc - from.UtcDateTime).TotalSeconds / resolution))
            .OrderBy(x => x.Key).Select(group => new
            {
                t = from.AddSeconds(group.Key * resolution),
                min = group.Min(x => x.Value), mean = group.Average(x => x.Value),
                max = group.Max(x => x.Value), count = group.Count()
            }).ToArray();
        return Results.Ok(new
        {
            signal, label = signal, resolutionSeconds = resolution, buckets,
            gaps = rows.Count == 0 ? new[] { new { from, to, reason = "no_data" } } : [],
            provenance = new
            {
                source = rows.Select(x => x.Source).Distinct().Count() == 1 ? rows[0].Source : "multiple-site-agents",
                observedAt = rows.Count == 0 ? (DateTimeOffset?)null : rows[^1].ObservedUtc,
                computedAt = DateTimeOffset.UtcNow
            }
        });
    }

    private static async Task<bool> VisibleAsset(Guid orgId, Guid assetId, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return false;
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == assetId, ct);
        return asset is not null && AccessPolicy.CanRead(http.User, asset.SiteId);
    }
}
