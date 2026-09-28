namespace Waylorn.ControlPlane.Domain;

public enum AssetKind { Industrial, Compute, Network, Cloud, Storage, Application, Security }
public enum RelationKind { Controls, ConnectedTo, DependsOn, ProgrammedBy, MonitoredBy, HostedOn, SendsDataTo, RepresentedBy, ProtectedBy }
// Numeric values match src/contracts/ot/v1/ot.proto and the Rust OT gate.
public enum OperationKind { Unspecified = 0, Discover = 1, Identify = 2, Read = 3, Subscribe = 4,
    Health = 5, ReadConfiguration = 6, ChangeConfiguration = 7, Write = 8 }
public enum RiskClass { Green, Amber, Red }
public enum CommandState { Pending, Approved, Rejected }
public enum IncidentSeverity { Info, Notice, Warning, Critical }
public enum IncidentState { Open, Acknowledged, Mitigated, Resolved }
public enum WorkOrderType { Preventive, Corrective, Inspection, Calibration }
public enum WorkOrderState { Planned, Scheduled, InProgress, Completed, Cancelled }

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
    // Combined read requests per minute that all of the site's gateways may issue to devices.
    public int MaxPollsPerMinute { get; set; } = 600;
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
    public string? IntegrityKeyId { get; set; }
    public string? IntegrityTag { get; set; }
    // Per-organization position and predecessor tag. Null only on records written before chaining.
    public long? ChainSequence { get; set; }
    public string? PreviousTag { get; set; }
}

// Last sealed audit position per organization, so tail truncation is visible to verification.
public sealed class AuditChainHead : ITenantOwned
{
    public Guid OrganizationId { get; set; }
    public long Sequence { get; set; }
    public string? Tag { get; set; }
}

// Site-local observation history. Samples are keyed by the producer request and signal
// so a retried batch cannot create duplicate measurements.
public sealed class TelemetrySample : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public Guid AssetId { get; set; }
    public Guid RequestId { get; set; }
    public string SignalKey { get; set; } = "";
    public int Value { get; set; }
    public string Source { get; set; } = "";
    public DateTime ObservedUtc { get; set; }
    public DateTime ReceivedUtc { get; set; }
    public int ExpectedIntervalMs { get; set; }
}

public sealed class SiteAgentHeartbeat : ITenantOwned
{
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public string AgentId { get; set; } = "";
    public DateTime LastSeenUtc { get; set; }
    public int IntervalMs { get; set; }
    // The gateway's locally approved interval; IntervalMs is the budgeted interval it runs at.
    public int RequestedIntervalMs { get; set; }
    public int SpoolDepth { get; set; }
}

public sealed class Incident : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public Guid PrimaryAssetId { get; set; }
    public string Title { get; set; } = "";
    public IncidentSeverity Severity { get; set; }
    public IncidentState State { get; set; }
    public string OpenedBy { get; set; } = "";
    public string? Owner { get; set; }
    public DateTime OpenedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
    public long Version { get; set; } = 1;
}

public sealed class IncidentAsset : ITenantOwned
{
    public Guid OrganizationId { get; set; }
    public Guid IncidentId { get; set; }
    public Guid AssetId { get; set; }
}

public sealed class MaintenanceWorkOrder : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid SiteId { get; set; }
    public Guid AssetId { get; set; }
    public string Title { get; set; } = "";
    public WorkOrderType Type { get; set; }
    public WorkOrderState State { get; set; }
    public DateTime? DueUtc { get; set; }
    public DateTime? CompletedUtc { get; set; }
    public string CreatedBy { get; set; } = "";
    public long Version { get; set; } = 1;
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
}

public enum OutboxDestination { Audit, Control, Operations }

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

    public static RiskClass Classify(OperationKind operation, AssetKind assetKind) =>
        operation == OperationKind.ChangeConfiguration &&
        assetKind is AssetKind.Industrial or AssetKind.Network or AssetKind.Security
            ? RiskClass.Red : Classify(operation);

    public static bool IsApprovalReady(CommandRequest command, string approver, DateTimeOffset now) =>
        command.State == CommandState.Pending &&
        !string.IsNullOrWhiteSpace(command.Requester) &&
        !string.IsNullOrWhiteSpace(approver) &&
        command.Requester != approver &&
        command.Risk == RiskClass.Amber &&
        !string.IsNullOrWhiteSpace(command.ChangeTicket) &&
        command.WindowStartUtc <= now && now <= command.WindowEndUtc;
}

// Ordered: a destination's ceiling admits every class at or below it.
public enum DataClassification { Public, Internal, Confidential, Restricted }

public enum DataCategory
{
    AssetInventory, Topology, TelemetryAggregates, RawTelemetry, PlcConfiguration, Recipes,
    SecurityEvents, NetworkDetails, PersonalData, AuditRecords, MaintenanceRecords, ReliabilityMetrics
}

public enum DataLocality { OnPremises, CustomerCloud, External }

public enum EgressDecision { Allowed, Blocked, PendingApproval }

// A system outside the control plane that may receive data: a model provider, analytics store, or integration.
public sealed class EgressDestination : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public string DisplayName { get; set; } = "";
    public string ProviderClass { get; set; } = "";
    public string Endpoint { get; set; } = "";
    public string Model { get; set; } = "";
    public DataLocality Locality { get; set; }
    public DataClassification ClassificationCeiling { get; set; }
    public bool Enabled { get; set; }
    public DateTimeOffset CreatedUtc { get; set; }
}

// One versioned policy per destination. Rules holds the contract's AiDataPolicyUpdate body as JSON;
// the gate reads its category lists and approval flag.
public sealed class EgressPolicy : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid DestinationId { get; set; }
    public long Version { get; set; }
    public string Rules { get; set; } = "";
    public DateTimeOffset UpdatedUtc { get; set; }
    public string UpdatedBy { get; set; } = "";
}

// Every gate decision, including blocked and pending ones, so the record shows what was attempted.
public sealed class EgressRecord : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid DestinationId { get; set; }
    public DateTime AtUtc { get; set; }
    public string Categories { get; set; } = "";
    public EgressDecision Decision { get; set; }
    public string Reason { get; set; } = "";
    public long PolicyVersion { get; set; }
    public string Actor { get; set; } = "";
    public string ActorType { get; set; } = "";
    public int Bytes { get; set; }
    public int RedactedFieldCount { get; set; }
}
