using System.Text.Json;
using Confluent.Kafka;
using NATS.Client.Core;
using NATS.Client.JetStream.Models;
using NATS.Net;

namespace Waylorn.ControlPlane.Infrastructure;

public interface IIdentityReadiness
{
    Task<bool> IsReady(CancellationToken ct);
}

public sealed class IdentityReadiness(IHttpClientFactory clients, IConfiguration configuration) : IIdentityReadiness
{
    public async Task<bool> IsReady(CancellationToken ct)
    {
        var authority = configuration["Authentication:Authority"]!.TrimEnd('/');
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            using var response = await clients.CreateClient("identity-readiness")
                .GetAsync(authority + "/.well-known/openid-configuration", timeout.Token);
            if (!response.IsSuccessStatusCode) return false;
            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(timeout.Token), cancellationToken: timeout.Token);
            return document.RootElement.TryGetProperty("issuer", out var issuer) &&
                issuer.GetString() == authority &&
                document.RootElement.TryGetProperty("jwks_uri", out var keys) &&
                !string.IsNullOrWhiteSpace(keys.GetString());
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            return false;
        }
    }
}

public sealed class EventingReadiness(IConfiguration configuration, IHostEnvironment environment)
{
    public bool Enabled => configuration.GetValue("Eventing:Enabled", !environment.IsDevelopment());

    public async Task<bool> IsReady(CancellationToken ct)
    {
        if (!Enabled) return true;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            await using var nats = new NatsClient(new NatsOpts { Url = configuration["Eventing:NatsUrl"]! });
            var jetStream = nats.CreateJetStreamContext();
            await jetStream.GetStreamAsync("WAYLORN_CONTROL", new StreamInfoRequest(), timeout.Token);
            await jetStream.GetStreamAsync("WAYLORN_OPERATIONS", new StreamInfoRequest(), timeout.Token);
            timeout.Token.ThrowIfCancellationRequested();

            using var kafka = new AdminClientBuilder(new AdminClientConfig
                { BootstrapServers = configuration["Eventing:KafkaBootstrapServers"] }).Build();
            var metadata = kafka.GetMetadata("waylorn.audit.v1", TimeSpan.FromSeconds(3));
            return metadata.Topics.Any(topic => topic.Topic == "waylorn.audit.v1" && !topic.Error.IsError);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            return false;
        }
    }
}
