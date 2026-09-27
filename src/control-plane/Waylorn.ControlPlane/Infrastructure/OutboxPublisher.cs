using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using NATS.Client.Core;
using NATS.Client.JetStream.Models;
using NATS.Net;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Infrastructure;

public sealed class OutboxPublisher(
    IServiceScopeFactory scopes, IConfiguration configuration, ILogger<OutboxPublisher> logger,
    OutboxDestination destination) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (destination == OutboxDestination.Control)
        {
            await using var nats = new NatsClient(new NatsOpts { Url = configuration["Eventing:NatsUrl"]! });
            var jetStream = nats.CreateJetStreamContext();
            if (configuration.GetValue<bool>("Eventing:BootstrapDestinations"))
                await jetStream.CreateOrUpdateStreamAsync(
                    new StreamConfig("WAYLORN_CONTROL", ["waylorn.control.v1.>"]), stoppingToken);
            await PollAsync(async (message, ct) =>
            {
                var headers = new NatsHeaders { ["Nats-Msg-Id"] = message.Id.ToString() };
                await jetStream.PublishAsync(message.Subject, message.Payload,
                    headers: headers, cancellationToken: ct);
            }, stoppingToken);
        }
        else
        {
            using var kafka = new ProducerBuilder<string, string>(new ProducerConfig
            {
                BootstrapServers = configuration["Eventing:KafkaBootstrapServers"],
                EnableIdempotence = true,
                Acks = Acks.All,
                MessageTimeoutMs = 10_000
            }).Build();
            await PollAsync(async (message, ct) =>
            {
                await kafka.ProduceAsync(message.Subject,
                    new Message<string, string> { Key = message.Id.ToString(), Value = message.Payload }, ct);
            }, stoppingToken);
        }
    }

    private async Task PollAsync(Func<OutboxMessage, CancellationToken, Task> publish, CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<WaylornDbContext>();
                var now = DateTimeOffset.UtcNow;
                var ids = await db.Outbox.IgnoreQueryFilters().AsNoTracking()
                    .Where(x => x.Destination == destination && x.PublishedUtc == null && x.NextAttemptUtc <= now &&
                        (x.LeaseUntilUtc == null || x.LeaseUntilUtc < now))
                    .OrderBy(x => x.CreatedUtc).Select(x => x.Id).Take(32).ToListAsync(stoppingToken);
                foreach (var id in ids)
                {
                    var claim = Guid.NewGuid();
                    var acquired = await db.Outbox.IgnoreQueryFilters()
                        .Where(x => x.Id == id && x.PublishedUtc == null &&
                            (x.LeaseUntilUtc == null || x.LeaseUntilUtc < DateTimeOffset.UtcNow))
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(x => x.ClaimToken, claim)
                            .SetProperty(x => x.LeaseUntilUtc, DateTimeOffset.UtcNow.AddMinutes(2)), stoppingToken);
                    if (acquired != 1) continue;
                    var message = await db.Outbox.IgnoreQueryFilters().AsNoTracking()
                        .SingleAsync(x => x.Id == id && x.ClaimToken == claim, stoppingToken);
                    try
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(TimeSpan.FromSeconds(10));
                        await publish(message, timeout.Token);
                        await db.Outbox.IgnoreQueryFilters().Where(x => x.Id == id && x.ClaimToken == claim)
                            .ExecuteUpdateAsync(s => s.SetProperty(x => x.PublishedUtc, DateTimeOffset.UtcNow)
                                .SetProperty(x => x.LeaseUntilUtc, (DateTimeOffset?)null)
                                .SetProperty(x => x.ClaimToken, (Guid?)null)
                                .SetProperty(x => x.LastError, (string?)null), stoppingToken);
                    }
                    catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                    {
                        var delay = TimeSpan.FromSeconds(Math.Min(300, 1 << Math.Min(message.Attempts, 8)));
                        await db.Outbox.IgnoreQueryFilters().Where(x => x.Id == id && x.ClaimToken == claim)
                            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Attempts, x => x.Attempts + 1)
                                .SetProperty(x => x.NextAttemptUtc, DateTimeOffset.UtcNow.Add(delay))
                                .SetProperty(x => x.LeaseUntilUtc, (DateTimeOffset?)null)
                                .SetProperty(x => x.ClaimToken, (Guid?)null)
                                .SetProperty(x => x.LastError, ex.GetType().Name), stoppingToken);
                        logger.LogWarning(ex, "Outbox event {EventId} could not be published", id);
                    }
                }
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "{Destination} outbox polling failed", destination);
            }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
