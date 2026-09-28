using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record EgressDestinationInput(string DisplayName, string ProviderClass, string Endpoint, string Model,
    string Locality, string ClassificationCeiling, bool Enabled);
public sealed record EgressDecisionInput(Guid DestinationId, string[] Categories, int Bytes, int RedactedFieldCount);

// Classified egress (ADR 0035). Every export or model call must first obtain a decision here; the record is
// written whatever the outcome. The API performs no egress itself.
public static class EgressEndpoints
{
    private static readonly string[] ProviderClasses = ["ollama", "lm_studio", "vllm", "llama_cpp",
        "openai_compatible", "openai", "azure_openai", "anthropic", "gemini", "watsonx", "other"];
    private static readonly string[] Requesters = ["Viewer", "Operator", "Administrator", "EgressGateway"];

    public static void MapEgressEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/egress/destinations", CreateDestination);
        api.MapPost("/egress/decisions", Decide);
    }

    public static void MapEgressFrontendEndpoints(this RouteGroupBuilder frontend)
    {
        frontend.MapGet("/orgs/{orgId:guid}/ai/providers", ListProviders);
        frontend.MapGet("/orgs/{orgId:guid}/ai/policies", ListPolicies);
        frontend.MapPut("/orgs/{orgId:guid}/ai/policies/{policyId:guid}", UpdatePolicy);
        frontend.MapGet("/orgs/{orgId:guid}/ai/egress", ListEgress);
    }

    // Opening a data path is an organization-wide administrative change and needs a second factor.
    private static bool CanGovern(ClaimsPrincipal user, WaylornDbContext db) =>
        db.OrganizationId != Guid.Empty && AccessPolicy.HasRole(user, "Administrator") &&
        user.FindFirstValue("principal_type") == "human" && user.FindAll("site_id").Any(x => x.Value == "*") &&
        AccessPolicy.HasStrongAuthentication(user);

    private static bool CanRead(ClaimsPrincipal user) =>
        AccessPolicy.HasRole(user, "Administrator") || AccessPolicy.HasRole(user, "Operator") ||
        AccessPolicy.HasRole(user, "Viewer");

    private static async Task<IResult> CreateDestination(EgressDestinationInput input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (!CanGovern(http.User, db)) return Results.Forbid();
        if (input.DisplayName is not { Length: > 0 and <= 200 } || input.Model is not { Length: > 0 and <= 200 } ||
            !ProviderClasses.Contains(input.ProviderClass) ||
            !EgressGate.TryParse<DataLocality>(input.Locality, out var locality) ||
            !EgressGate.TryParse<DataClassification>(input.ClassificationCeiling, out var ceiling) ||
            input.Endpoint is not { Length: <= 500 } ||
            !Uri.TryCreate(input.Endpoint, UriKind.Absolute, out var endpoint) ||
            endpoint.Scheme != "https" && (endpoint.Scheme != "http" || locality != DataLocality.OnPremises) ||
            !string.IsNullOrEmpty(endpoint.UserInfo))
            return Results.BadRequest();
        var destination = new EgressDestination
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, DisplayName = input.DisplayName.Trim(),
            ProviderClass = input.ProviderClass, Endpoint = input.Endpoint, Model = input.Model.Trim(),
            Locality = locality, ClassificationCeiling = ceiling, Enabled = input.Enabled,
            CreatedUtc = DateTimeOffset.UtcNow
        };
        var subject = AccessPolicy.Subject(http.User);
        db.EgressDestinations.Add(destination);
        db.EgressPolicies.Add(new EgressPolicy
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, DestinationId = destination.Id, Version = 1,
            Rules = JsonSerializer.Serialize(EgressRules.DenyAll, EgressGate.RulesJson),
            UpdatedUtc = destination.CreatedUtc, UpdatedBy = subject
        });
        AuditWriter.Add(db, subject, "egress.destination.create", "egress-destination", destination.Id, null);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/egress/destinations/{destination.Id}", ProviderView(destination));
    }

    private static async Task<IResult> Decide(EgressDecisionInput input, HttpContext http, WaylornDbContext db,
        CancellationToken ct)
    {
        if (db.OrganizationId == Guid.Empty || !Requesters.Any(role => AccessPolicy.HasRole(http.User, role)))
            return Results.Forbid();
        var categories = new List<DataCategory>();
        foreach (var name in input.Categories ?? [])
        {
            if (!EgressGate.TryParse<DataCategory>(name, out var category)) return Results.BadRequest();
            if (!categories.Contains(category)) categories.Add(category);
        }
        if (categories.Count == 0 || input.Bytes is < 0 or > 100_000_000 || input.RedactedFieldCount is < 0 or > 1_000_000)
            return Results.BadRequest();
        var destination = await db.EgressDestinations.SingleOrDefaultAsync(x => x.Id == input.DestinationId, ct);
        var policy = destination is null ? null
            : await db.EgressPolicies.SingleOrDefaultAsync(x => x.DestinationId == destination.Id, ct);
        var rules = policy is null ? null : JsonSerializer.Deserialize<EgressRules>(policy.Rules, EgressGate.RulesJson);
        var (decision, reason) = EgressGate.Decide(destination, rules, categories);
        var subject = AccessPolicy.Subject(http.User);
        var record = new EgressRecord
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, DestinationId = input.DestinationId,
            AtUtc = DateTime.UtcNow, Categories = string.Join(',', categories.Select(EgressGate.Wire)),
            Decision = decision, Reason = reason, PolicyVersion = policy?.Version ?? 0, Actor = subject,
            ActorType = http.User.FindFirstValue("principal_type") == "human" ? "human" : "service",
            Bytes = input.Bytes, RedactedFieldCount = input.RedactedFieldCount
        };
        db.EgressRecords.Add(record);
        AuditWriter.Add(db, subject, "egress.decide", "egress-record", record.Id, null, EgressGate.Wire(decision));
        await db.SaveChangesAsync(ct);
        // The sender must apply these transformations before any allowed transfer.
        return Results.Ok(new
        {
            record.Id, decision = EgressGate.Wire(decision), reason, policyVersion = record.PolicyVersion,
            obligations = decision == EgressDecision.Allowed && rules is not null
                ? new { rules.Redaction, rules.Pseudonymization, rules.Aggregation } : null
        });
    }

    private static async Task<IResult> ListProviders(Guid orgId, HttpContext http, WaylornDbContext db,
        CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!CanRead(http.User)) return Results.Forbid();
        var rows = await db.EgressDestinations.AsNoTracking().OrderBy(x => x.DisplayName).Take(200).ToListAsync(ct);
        return Results.Ok(new { items = rows.Select(ProviderView) });
    }

    private static async Task<IResult> ListPolicies(Guid orgId, HttpContext http, WaylornDbContext db,
        CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!CanRead(http.User)) return Results.Forbid();
        var destinations = await db.EgressDestinations.AsNoTracking().Take(200).ToDictionaryAsync(x => x.Id, ct);
        var ids = destinations.Keys.ToArray();
        var policies = await db.EgressPolicies.AsNoTracking().Where(x => ids.Contains(x.DestinationId)).ToListAsync(ct);
        return Results.Ok(new { items = policies.Select(x => PolicyView(x, destinations[x.DestinationId])) });
    }

    private static async Task<IResult> UpdatePolicy(Guid orgId, Guid policyId, EgressRules input, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!CanGovern(http.User, db)) return Results.Forbid();
        if (!long.TryParse(http.Request.Headers.IfMatch.ToString().Trim('"'), out var expected))
            return Results.StatusCode(StatusCodes.Status428PreconditionRequired);
        if (!EgressGate.Valid(input)) return Results.BadRequest();
        var policy = await db.EgressPolicies.SingleOrDefaultAsync(x => x.Id == policyId, ct);
        if (policy is null) return Results.NotFound();
        if (policy.Version != expected) return Results.StatusCode(StatusCodes.Status412PreconditionFailed);
        var destination = await db.EgressDestinations.AsNoTracking().SingleAsync(x => x.Id == policy.DestinationId, ct);
        policy.Rules = JsonSerializer.Serialize(input, EgressGate.RulesJson);
        policy.Version++;
        policy.UpdatedUtc = DateTimeOffset.UtcNow;
        policy.UpdatedBy = AccessPolicy.Subject(http.User);
        AuditWriter.Add(db, policy.UpdatedBy, "egress.policy.update", "egress-policy", policy.Id, null);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.StatusCode(StatusCodes.Status412PreconditionFailed); }
        http.Response.Headers.ETag = $"\"{policy.Version}\"";
        return Results.Ok(PolicyView(policy, destination));
    }

    private static async Task<IResult> ListEgress(Guid orgId, string? cursor, int? limit, HttpContext http,
        WaylornDbContext db, CancellationToken ct)
    {
        if (orgId == Guid.Empty || orgId != db.OrganizationId) return Results.NotFound();
        if (!CanRead(http.User)) return Results.Forbid();
        if (limit is < 1 or > 100) return Results.BadRequest();
        var offset = 0;
        if (cursor is not null && (!cursor.StartsWith("o:") || !int.TryParse(cursor.AsSpan(2), out offset) ||
            offset < 0 || offset > 1_000_000)) return Results.BadRequest();
        var size = limit ?? 50;
        var total = await db.EgressRecords.CountAsync(ct);
        var rows = await db.EgressRecords.AsNoTracking().OrderByDescending(x => x.AtUtc).ThenByDescending(x => x.Id)
            .Skip(offset).Take(size).ToListAsync(ct);
        var ids = rows.Select(x => x.DestinationId).Distinct().ToArray();
        var localities = await db.EgressDestinations.AsNoTracking().Where(x => ids.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Locality, ct);
        return Results.Ok(new
        {
            items = rows.Select(x => new
            {
                id = x.Id, at = x.AtUtc, providerId = x.DestinationId,
                // A decision for an unknown destination is external until proven otherwise.
                locality = EgressGate.Wire(localities.GetValueOrDefault(x.DestinationId, DataLocality.External)),
                categories = x.Categories.Split(',', StringSplitOptions.RemoveEmptyEntries),
                redactedFieldCount = x.RedactedFieldCount, bytes = x.Bytes, decision = EgressGate.Wire(x.Decision),
                actor = new { subject = x.Actor, displayName = x.Actor, type = x.ActorType }
            }),
            page = new { nextCursor = offset + rows.Count < total ? $"o:{offset + rows.Count}" : null, totalEstimate = total }
        });
    }

    private static object ProviderView(EgressDestination x) => new
    {
        id = x.Id, displayName = x.DisplayName, providerClass = x.ProviderClass, endpoint = x.Endpoint, model = x.Model,
        locality = EgressGate.Wire(x.Locality), classificationCeiling = EgressGate.Wire(x.ClassificationCeiling),
        status = x.Enabled ? "enabled" : "disabled"
    };

    private static object PolicyView(EgressPolicy policy, EgressDestination destination)
    {
        var rules = JsonSerializer.Deserialize<EgressRules>(policy.Rules, EgressGate.RulesJson)!;
        return new
        {
            id = policy.Id, providerId = policy.DestinationId, version = policy.Version.ToString(),
            classification = EgressGate.Wire(destination.ClassificationCeiling), updatedAt = policy.UpdatedUtc,
            updatedBy = new { subject = policy.UpdatedBy, displayName = policy.UpdatedBy, type = "human" },
            rules.AllowedCategories, rules.ProhibitedCategories, rules.Redaction, rules.Pseudonymization,
            rules.Aggregation, rules.Approval, rules.Retention
        };
    }
}
