namespace Waylorn.ControlPlane.Application;

public static class TelemetryPolicy
{
    public const int RetentionDays = 7;
    public static readonly TimeSpan Retention = TimeSpan.FromDays(RetentionDays);
}
