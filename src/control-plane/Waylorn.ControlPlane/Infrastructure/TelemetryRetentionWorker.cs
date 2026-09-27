using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;

namespace Waylorn.ControlPlane.Infrastructure;

public sealed class TelemetryRetentionWorker(IServiceScopeFactory scopes,
    ILogger<TelemetryRetentionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Startup migrations may still be running. Queries hide expired rows immediately;
        // deletion follows on the next hourly sweep.
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WaylornDbContext>();
                var cutoff = DateTime.UtcNow - TelemetryPolicy.Retention;
                var deleted = await db.Telemetry.IgnoreQueryFilters()
                    .Where(x => x.ObservedUtc < cutoff).ExecuteDeleteAsync(stoppingToken);
                if (deleted > 0) logger.LogInformation("Deleted {Count} expired site telemetry samples", deleted);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogError(error, "Telemetry retention sweep failed");
            }
        }
    }
}
