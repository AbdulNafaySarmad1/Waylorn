namespace Waylorn.ControlPlane.Application;

public sealed class TelemetryPolicy(int retentionDays)
{
    public TimeSpan Retention { get; } = TimeSpan.FromDays(retentionDays);
    public string IsoPeriod { get; } = $"P{retentionDays}D";
}
