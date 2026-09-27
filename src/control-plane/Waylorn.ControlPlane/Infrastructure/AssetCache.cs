using System.Text.Json;
using StackExchange.Redis;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Infrastructure;

// A short-lived read optimization. PostgreSQL remains authoritative for all writes and commands.
public sealed class AssetCache : IDisposable
{
    private readonly Lazy<IConnectionMultiplexer>? connection;
    private readonly ILogger<AssetCache> logger;

    public AssetCache(IConfiguration configuration, ILogger<AssetCache> logger)
    {
        this.logger = logger;
        var endpoint = configuration["Cache:Endpoint"];
        if (!string.IsNullOrWhiteSpace(endpoint))
            connection = new Lazy<IConnectionMultiplexer>(() =>
            {
                var options = ConfigurationOptions.Parse(endpoint);
                options.AbortOnConnectFail = false;
                options.ConnectTimeout = 1000;
                options.SyncTimeout = 1000;
                return ConnectionMultiplexer.Connect(options);
            });
    }

    public async Task<Asset?> GetAsync(Guid organizationId, Guid id)
    {
        if (connection is null) return null;
        try
        {
            var value = await connection.Value.GetDatabase().StringGetAsync(Key(organizationId, id));
            return value.IsNull ? null : JsonSerializer.Deserialize<Asset>((string)value!);
        }
        catch (Exception ex) when (ex is RedisException or TimeoutException)
        {
            logger.LogWarning(ex, "Asset cache read failed; using PostgreSQL");
            return null;
        }
    }

    public async Task SetAsync(Asset asset)
    {
        if (connection is null) return;
        try
        {
            await connection.Value.GetDatabase().StringSetAsync(Key(asset.OrganizationId, asset.Id),
                JsonSerializer.Serialize(asset), TimeSpan.FromSeconds(30));
        }
        catch (Exception ex) when (ex is RedisException or TimeoutException)
        {
            logger.LogWarning(ex, "Asset cache write failed; PostgreSQL remains authoritative");
        }
    }

    public async Task InvalidateAsync(Guid organizationId, Guid id)
    {
        if (connection is null) return;
        try { await connection.Value.GetDatabase().KeyDeleteAsync(Key(organizationId, id)); }
        catch (Exception ex) when (ex is RedisException or TimeoutException)
        {
            logger.LogWarning(ex, "Asset cache invalidation failed; entry expires within 30 seconds");
        }
    }

    public void Dispose()
    {
        if (connection?.IsValueCreated == true) connection.Value.Dispose();
    }

    private static string Key(Guid org, Guid id) => $"waylorn:asset:v1:{org:N}:{id:N}";
}
