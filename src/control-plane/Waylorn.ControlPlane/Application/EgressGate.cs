using System.Text.Json;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Application;

// The draft contract's AiDataPolicyUpdate body. The gate enforces the category lists and approval flag;
// redaction, pseudonymization, aggregation, and retention are obligations on the sending gateway.
public sealed record RedactionRule(bool Enabled, string[] Fields);
public sealed record PseudonymizationRule(bool Enabled, string[] Scopes);
public sealed record AggregationRule(bool Enabled, int? MinimumGroupSize);
public sealed record ApprovalRule(bool Required, string? ApproverRole);
public sealed record RetentionRule(int LocalTranscriptDays, string? ProviderRetention);
public sealed record EgressRules(string[] AllowedCategories, string[] ProhibitedCategories, RedactionRule Redaction,
    PseudonymizationRule Pseudonymization, AggregationRule Aggregation, ApprovalRule Approval, RetentionRule Retention)
{
    public static EgressRules DenyAll { get; } = new([], [], new(false, []), new(false, []), new(false, null),
        new(true, "Administrator"), new(0, null));
}

// Classification v1 (ADR 0035). Raw process data and configuration stay on premises unless a destination's
// ceiling is explicitly raised to restricted and its policy names the category.
public static class EgressGate
{
    public static readonly JsonSerializerOptions RulesJson = new(JsonSerializerDefaults.Web);
    private static readonly string[] PseudonymizationScopes = ["people", "sites", "assets", "network_addresses"];

    public static DataClassification Classify(DataCategory category) => category switch
    {
        DataCategory.RawTelemetry or DataCategory.PlcConfiguration or DataCategory.Recipes => DataClassification.Restricted,
        DataCategory.Topology or DataCategory.NetworkDetails or DataCategory.SecurityEvents or
            DataCategory.PersonalData or DataCategory.AuditRecords => DataClassification.Confidential,
        _ => DataClassification.Internal
    };

    public static (EgressDecision Decision, string Reason) Decide(EgressDestination? destination, EgressRules? rules,
        IReadOnlyCollection<DataCategory> categories)
    {
        if (destination is not { Enabled: true }) return (EgressDecision.Blocked, "destination-disabled");
        if (rules is null) return (EgressDecision.Blocked, "no-policy");
        var names = categories.Select(Wire).ToArray();
        if (names.Any(rules.ProhibitedCategories.Contains)) return (EgressDecision.Blocked, "prohibited-category");
        if (!names.All(rules.AllowedCategories.Contains)) return (EgressDecision.Blocked, "category-not-allowed");
        if (categories.Max(Classify) > destination.ClassificationCeiling)
            return (EgressDecision.Blocked, "above-classification-ceiling");
        return rules.Approval.Required ? (EgressDecision.PendingApproval, "approval-required")
            : (EgressDecision.Allowed, "policy-allowed");
    }

    public static bool Valid(EgressRules? rules) =>
        rules is { Redaction: not null, Pseudonymization: not null, Aggregation: not null, Approval: not null,
            Retention: not null, AllowedCategories: not null, ProhibitedCategories: not null } &&
        rules.AllowedCategories.Concat(rules.ProhibitedCategories).All(x => TryParse<DataCategory>(x, out _)) &&
        !rules.AllowedCategories.Intersect(rules.ProhibitedCategories).Any() &&
        rules.AllowedCategories.Length <= 12 && rules.ProhibitedCategories.Length <= 12 &&
        rules.Redaction.Fields is { Length: <= 100 } fields && fields.All(x => x is { Length: > 0 and <= 200 }) &&
        rules.Pseudonymization.Scopes is { } scopes && scopes.All(PseudonymizationScopes.Contains) &&
        rules.Aggregation.MinimumGroupSize is null or >= 2 and <= 1_000_000 &&
        rules.Approval.ApproverRole is null or { Length: > 0 and <= 80 } &&
        rules.Retention.LocalTranscriptDays is >= 0 and <= 3650 &&
        rules.Retention.ProviderRetention is null or { Length: <= 500 };

    // The v0 contract spells enum members in snake case.
    public static string Wire<T>(T value) where T : struct, Enum =>
        JsonNamingPolicy.SnakeCaseLower.ConvertName(value.ToString());

    public static bool TryParse<T>(string? value, out T parsed) where T : struct, Enum
    {
        foreach (var candidate in Enum.GetValues<T>())
            if (Wire(candidate) == value) { parsed = candidate; return true; }
        parsed = default;
        return false;
    }
}
