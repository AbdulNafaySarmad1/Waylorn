using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Application;

public sealed record SiteConnectivity(string State, DateTime? LastContactAt);

public static class SiteConnectivityPolicy
{
    public static SiteConnectivity Evaluate(SiteAgentHeartbeat? heartbeat, DateTime now)
    {
        if (heartbeat is null) return new("unknown", null);
        var timeout = TimeSpan.FromMilliseconds(Math.Max(30_000L, 3L * heartbeat.IntervalMs));
        if (heartbeat.LastSeenUtc > now.AddMinutes(2) || now - heartbeat.LastSeenUtc > timeout)
            return new("disconnected", heartbeat.LastSeenUtc);
        return new(heartbeat.SpoolDepth > 0 ? "degraded" : "connected", heartbeat.LastSeenUtc);
    }
}
