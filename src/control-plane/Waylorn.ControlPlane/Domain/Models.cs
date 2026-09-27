namespace Waylorn.ControlPlane.Domain;

public enum AssetKind { Industrial, Compute, Network, Cloud, Storage, Application, Security }
public enum RelationKind { Controls, ConnectedTo, DependsOn, ProgrammedBy, MonitoredBy, HostedOn, SendsDataTo, RepresentedBy, ProtectedBy }
// Numeric values match src/contracts/ot/v1/ot.proto and the Rust OT gate.
public enum OperationKind { Unspecified = 0, Discover = 1, Identify = 2, Read = 3, Subscribe = 4,
    Health = 5, ReadConfiguration = 6, ChangeConfiguration = 7, Write = 8 }
public enum RiskClass { Green, Amber, Red }
public enum CommandState { Pending, Approved, Rejected }

public interface ITenantOwned { Guid OrganizationId { get; } }

public sealed class Organization : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedUtc { get; set; }
}

public sealed class Site : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string RegionName { get; set; } = "";
    public string Timezone { get; set; } = "UTC";
    public string Environment { get; set; } = "lab";
    public DateTimeOffset CreatedUtc { get; set; }
}

public sealed class Zone : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedUtc { get; set; }
}

public sealed class Asset : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public Guid? ZoneId { get; set; }
    public AssetKind Kind { get; set; }
    public string Name { get; set; } = "";
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public string? Serial { get; set; }
    public string? Firmware { get; set; }
    public long Version { get; set; } = 1;
    public bool Deleted { get; set; }
    public DateTimeOffset CreatedUtc { get; set; }
}

public sealed class AssetRelation : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SourceAssetId { get; set; }
    public Guid TargetAssetId { get; set; }
    public RelationKind Kind { get; set; }
    public DateTimeOffset CreatedUtc { get; set; }
}

public sealed class CommandRequest : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public Guid AssetId { get; set; }
    public OperationKind Operation { get; set; }
    public RiskClass Risk { get; set; }
    public CommandState State { get; set; }
    public string Requester { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public string? ChangeTicket { get; set; }
    public DateTimeOffset? WindowStartUtc { get; set; }
    public DateTimeOffset? WindowEndUtc { get; set; }
    public string? Approver { get; set; }
    public DateTimeOffset? ApprovedUtc { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset RequestedUtc { get; set; }
}

public sealed class AuditRecord : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid? SiteId { get; set; }
    public string Principal { get; set; } = "";
    public string Action { get; set; } = "";
    public string TargetType { get; set; } = "";
    public Guid TargetId { get; set; }
    public string Outcome { get; set; } = "";
    public DateTimeOffset AtUtc { get; set; }
}

public enum OutboxDestination { Audit, Control }

public sealed class OutboxMessage : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid? SiteId { get; set; }
    public OutboxDestination Destination { get; set; }
    public string Subject { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTimeOffset CreatedUtc { get; set; }
    public DateTimeOffset? PublishedUtc { get; set; }
    public DateTimeOffset NextAttemptUtc { get; set; }
    public DateTimeOffset? LeaseUntilUtc { get; set; }
    public Guid? ClaimToken { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}

public static class CommandPolicy
{
    public static RiskClass Classify(OperationKind operation) => operation switch
    {
        OperationKind.ChangeConfiguration => RiskClass.Amber,
        OperationKind.Write => RiskClass.Red,
        _ => RiskClass.Green
    };

    public static bool IsApprovalReady(CommandRequest command, string approver, bool strongAuthentication, DateTimeOffset now) =>
        command.State == CommandState.Pending &&
        !string.IsNullOrWhiteSpace(command.Requester) &&
        !string.IsNullOrWhiteSpace(approver) &&
        command.Requester != approver &&
        command.Risk != RiskClass.Green &&
        !string.IsNullOrWhiteSpace(command.ChangeTicket) &&
        command.WindowStartUtc <= now && now <= command.WindowEndUtc &&
        (command.Risk != RiskClass.Red || strongAuthentication);
}
