namespace Waylorn.ControlPlane.Application;

// Each gateway cycle issues one read request to its device. A site's budget caps the combined request
// rate of its live gateways; when demand exceeds it, every interval stretches by the same factor so the
// total lands on the budget. The gateway never polls faster than its locally approved interval, so the
// budget can only slow polling down.
public static class PollingBudget
{
    public const int MaxIntervalMs = 3_600_000;

    public static int Assign(int requestedIntervalMs, IEnumerable<int> otherRequestedIntervalsMs, int maxPollsPerMinute)
    {
        var demand = otherRequestedIntervalsMs.Append(requestedIntervalMs).Sum(ms => 60_000d / ms);
        if (demand <= maxPollsPerMinute) return requestedIntervalMs;
        return (int)Math.Min(MaxIntervalMs, Math.Ceiling(requestedIntervalMs * demand / maxPollsPerMinute));
    }
}
