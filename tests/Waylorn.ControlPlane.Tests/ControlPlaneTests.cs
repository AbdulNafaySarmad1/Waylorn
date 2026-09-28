using System.Security.Claims;
using System.Net;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Waylorn.ControlPlane.Api;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;
using Xunit;

namespace Waylorn.ControlPlane.Tests;

public class ControlPlaneTests
{
    [Fact]
    public async Task Identity_readiness_requires_reachable_same_origin_signing_keys()
    {
        const string authority = "https://id.example.test/realms/waylorn";
        var keysUri = authority + "/protocol/openid-connect/certs";
        var keysAvailable = true;
        using var handler = new ReadinessHandler(request =>
        {
            var uri = request.RequestUri!.ToString();
            if (uri.EndsWith("/.well-known/openid-configuration", StringComparison.Ordinal))
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent($"{{\"issuer\":\"{authority}\",\"jwks_uri\":\"{keysUri}\"}}")
                };
            if (uri == keysUri)
                return new HttpResponseMessage(keysAvailable ? HttpStatusCode.OK : HttpStatusCode.ServiceUnavailable)
                {
                    Content = new StringContent("{\"keys\":[{\"kty\":\"RSA\"}]}")
                };
            throw new InvalidOperationException("Unexpected identity URL");
        });
        var clients = new ReadinessClientFactory(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Authentication:Authority"] = authority }).Build();
        var probe = new IdentityReadiness(clients, config);
        Assert.True(await probe.IsReady(CancellationToken.None));
        keysAvailable = false;
        Assert.False(await probe.IsReady(CancellationToken.None));
        keysUri = "https://other.example.test/certs";
        Assert.False(await probe.IsReady(CancellationToken.None));
    }

    [Fact]
    public void Audit_signature_detects_record_change()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Audit:KeyId"] = "test-v1",
            ["Audit:SigningKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)42, 32).ToArray())
        }).Build();
        var integrity = AuditIntegrity.FromConfiguration(config, required: true);
        var record = new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = Guid.NewGuid(), SiteId = Guid.NewGuid(),
            Principal = "operator", Action = "command.request", TargetType = "asset",
            TargetId = Guid.NewGuid(), Outcome = "denied", AtUtc = DateTimeOffset.UtcNow
        };
        integrity.Sign(record);
        Assert.Equal("verified", integrity.Verify(record));
        record.Outcome = "succeeded";
        Assert.Equal("broken", integrity.Verify(record));
        Assert.Equal("unverified", AuditIntegrity.Disabled.Verify(record));
    }

    [Fact]
    public void Audit_rotation_keeps_historical_records_verifiable()
    {
        var oldKey = Convert.ToBase64String(Enumerable.Repeat((byte)42, 32).ToArray());
        var newKey = Convert.ToBase64String(Enumerable.Repeat((byte)43, 32).ToArray());
        var oldConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Audit:KeyId"] = "v1", ["Audit:SigningKey"] = oldKey
        }).Build();
        var oldIntegrity = AuditIntegrity.FromConfiguration(oldConfig, required: true);
        var record = new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = Guid.NewGuid(), Principal = "admin",
            Action = "asset.create", TargetType = "asset", TargetId = Guid.NewGuid(),
            Outcome = "created", AtUtc = DateTimeOffset.UtcNow
        };
        oldIntegrity.Sign(record);
        var rotatedConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Audit:KeyId"] = "v2", ["Audit:SigningKey"] = newKey,
            ["Audit:VerificationKeys:v1"] = oldKey
        }).Build();
        var rotated = AuditIntegrity.FromConfiguration(rotatedConfig, required: true);
        Assert.Equal("verified", rotated.Verify(record));
        var newer = new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = record.OrganizationId, Principal = "admin",
            Action = "asset.update", TargetType = "asset", TargetId = record.TargetId,
            Outcome = "updated", AtUtc = DateTimeOffset.UtcNow
        };
        rotated.Sign(newer);
        Assert.Equal("v2", newer.IntegrityKeyId);
        Assert.Equal("verified", rotated.Verify(newer));
        Assert.Equal("unverified", oldIntegrity.Verify(newer));
    }

    [Fact]
    public void Site_link_state_uses_server_seen_heartbeat_and_spool_depth()
    {
        var now = DateTime.UtcNow;
        var row = new SiteAgentHeartbeat { LastSeenUtc = now, IntervalMs = 1000, SpoolDepth = 0 };
        Assert.Equal("unknown", SiteConnectivityPolicy.Evaluate(null, now).State);
        Assert.Equal("connected", SiteConnectivityPolicy.Evaluate(row, now).State);
        row.SpoolDepth = 2;
        Assert.Equal("degraded", SiteConnectivityPolicy.Evaluate(row, now).State);
        row.LastSeenUtc = now.AddSeconds(-31);
        Assert.Equal("disconnected", SiteConnectivityPolicy.Evaluate(row, now).State);
    }

    [Fact]
    public void Access_requires_matching_organization_site_and_role()
    {
        var org = Guid.NewGuid();
        var site = Guid.NewGuid();
        var principal = Principal(org, site, "Operator");
        Assert.True(AccessPolicy.CanRequest(principal, site));
        Assert.False(AccessPolicy.CanEdit(principal, site));
        Assert.False(AccessPolicy.CanRequest(principal, Guid.NewGuid()));
        Assert.False(AccessPolicy.CanApprove(principal, site));
        Assert.Equal(org, AccessPolicy.OrganizationId(principal));
    }

    [Fact]
    public void Only_amber_requests_can_be_approved_with_distinct_actor_ticket_and_window()
    {
        var now = DateTimeOffset.UtcNow;
        var command = new CommandRequest
        {
            Operation = OperationKind.Write, Risk = CommandPolicy.Classify(OperationKind.Write),
            State = CommandState.Pending, Requester = "operator", ChangeTicket = "CHG-1",
            WindowStartUtc = now.AddMinutes(-1), WindowEndUtc = now.AddMinutes(1)
        };
        Assert.Equal(RiskClass.Red, command.Risk);
        Assert.False(CommandPolicy.IsApprovalReady(command, "approver", now));
        Assert.Equal(RiskClass.Red, CommandPolicy.Classify(OperationKind.ChangeConfiguration, AssetKind.Industrial));
        Assert.Equal(RiskClass.Red, CommandPolicy.Classify(OperationKind.ChangeConfiguration, AssetKind.Network));
        Assert.Equal(RiskClass.Red, CommandPolicy.Classify(OperationKind.ChangeConfiguration, AssetKind.Security));
        Assert.Equal(RiskClass.Amber, CommandPolicy.Classify(OperationKind.ChangeConfiguration, AssetKind.Compute));
        command.Operation = OperationKind.ChangeConfiguration;
        command.Risk = RiskClass.Amber;
        Assert.False(CommandPolicy.IsApprovalReady(command, "operator", now));
        Assert.False(CommandPolicy.IsApprovalReady(command, "", now));
        Assert.True(CommandPolicy.IsApprovalReady(command, "approver", now));
        Assert.False(CommandPolicy.IsApprovalReady(command, "approver", now.AddMinutes(2)));
        Assert.Equal(3, (int)OperationKind.Read);
        Assert.Equal(7, (int)OperationKind.ChangeConfiguration);
        Assert.Equal(8, (int)OperationKind.Write);
    }

    [Fact]
    public async Task Tenant_filter_hides_assets_relationships_commands_and_audit()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(connection).Options;
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        var targetId = Guid.NewGuid();
        await using (var writer = new WaylornDbContext(options, new TenantScope(first)))
        {
            await writer.Database.EnsureCreatedAsync();
            writer.Assets.Add(new Asset { Id = assetId, OrganizationId = first, SiteId = Guid.NewGuid(), Name = "PLC", Kind = AssetKind.Industrial });
            writer.Assets.Add(new Asset { Id = targetId, OrganizationId = first, SiteId = Guid.NewGuid(), Name = "Gateway", Kind = AssetKind.Network });
            writer.Relationships.Add(new AssetRelation { Id = Guid.NewGuid(), OrganizationId = first, SourceAssetId = assetId, TargetAssetId = targetId });
            writer.Commands.Add(new CommandRequest { Id = Guid.NewGuid(), OrganizationId = first, AssetId = assetId, Requester = "u", IdempotencyKey = "long-enough-key-1" });
            writer.Audit.Add(new AuditRecord { Id = Guid.NewGuid(), OrganizationId = first, Action = "test" });
            await writer.SaveChangesAsync();
        }
        await using var other = new WaylornDbContext(options, new TenantScope(second));
        Assert.Empty(await other.Assets.ToListAsync());
        Assert.Empty(await other.Relationships.ToListAsync());
        Assert.Empty(await other.Commands.ToListAsync());
        Assert.Empty(await other.Audit.ToListAsync());
    }

    [Fact]
    public async Task Asset_version_detects_concurrent_update()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(connection).Options;
        var org = Guid.NewGuid();
        var assetId = Guid.NewGuid();
        await using (var setup = new WaylornDbContext(options, new TenantScope(org)))
        {
            await setup.Database.EnsureCreatedAsync();
            setup.Assets.Add(new Asset { Id = assetId, OrganizationId = org, SiteId = Guid.NewGuid(), Name = "PLC", Kind = AssetKind.Industrial });
            await setup.SaveChangesAsync();
        }
        await using var one = new WaylornDbContext(options, new TenantScope(org));
        await using var two = new WaylornDbContext(options, new TenantScope(org));
        var first = await one.Assets.SingleAsync(x => x.Id == assetId);
        var second = await two.Assets.SingleAsync(x => x.Id == assetId);
        first.Version++;
        first.Name = "first";
        await one.SaveChangesAsync();
        second.Version++;
        second.Name = "second";
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => two.SaveChangesAsync());
    }

    [Theory]
    [InlineData("none", "intact", 0L)]
    [InlineData("DELETE FROM Audit WHERE ChainSequence = 2", "missing", 2L)]
    [InlineData("DELETE FROM Audit WHERE ChainSequence = 4", "truncated", 4L)]
    [InlineData("UPDATE Audit SET ChainSequence = -1 WHERE ChainSequence = 2; " +
        "UPDATE Audit SET ChainSequence = 2 WHERE ChainSequence = 3; " +
        "UPDATE Audit SET ChainSequence = 3 WHERE ChainSequence = -1", "relinked", 2L)]
    [InlineData("UPDATE Audit SET Outcome = 'denied' WHERE ChainSequence = 3", "tampered", 3L)]
    [InlineData("UPDATE AuditHeads SET Sequence = 3", "beyond-head", 4L)]
    public async Task Audit_chain_detects_deletion_reordering_and_truncation(string tamper, string outcome, long at)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(connection).Options;
        var org = Guid.NewGuid();
        var integrity = SigningIntegrity();
        await using (var setup = new WaylornDbContext(options, new TenantScope(org), integrity))
        {
            await setup.Database.EnsureCreatedAsync();
            AuditWriter.Add(setup, "a", "one", "asset", Guid.NewGuid(), null);
            await setup.SaveChangesAsync();
            AuditWriter.Add(setup, "a", "two", "asset", Guid.NewGuid(), null);
            AuditWriter.Add(setup, "a", "three", "asset", Guid.NewGuid(), null);
            await setup.SaveChangesAsync();
        }
        // A second context appends after the first and must continue the same chain.
        await using (var later = new WaylornDbContext(options, new TenantScope(org), integrity))
        {
            AuditWriter.Add(later, "b", "four", "asset", Guid.NewGuid(), null);
            await later.SaveChangesAsync();
        }
        if (tamper != "none")
            await using (var command = connection.CreateCommand())
            {
                command.CommandText = tamper;
                await command.ExecuteNonQueryAsync();
            }

        await using var db = new WaylornDbContext(options, new TenantScope(org), integrity);
        var report = await AuditChain.VerifyAsync(db, CancellationToken.None);
        if (tamper == "none")
        {
            Assert.Equal("intact", report.State);
            Assert.Equal(4, report.Checked);
            Assert.Equal(4, report.HeadSequence);
            var fourth = await db.Audit.SingleAsync(x => x.ChainSequence == 4);
            Assert.Equal((await db.Audit.SingleAsync(x => x.ChainSequence == 3)).IntegrityTag, fourth.PreviousTag);
            // Without keys the structure still checks out, but it cannot be called intact.
            await using var keyless = new WaylornDbContext(options, new TenantScope(org));
            Assert.Equal("unverified", (await AuditChain.VerifyAsync(keyless, CancellationToken.None)).State);
            return;
        }
        Assert.Equal("broken", report.State);
        Assert.Equal(new AuditChainBreak(at, outcome), report.FirstBreak);
    }

    [Fact]
    public async Task Audit_records_are_append_only_through_the_context()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite(connection).Options;
        var org = Guid.NewGuid();
        await using var db = new WaylornDbContext(options, new TenantScope(org));
        await db.Database.EnsureCreatedAsync();
        AuditWriter.Add(db, "a", "one", "asset", Guid.NewGuid(), null);
        Assert.Throws<InvalidOperationException>(() => db.SaveChanges());
        await db.SaveChangesAsync();
        var record = await db.Audit.SingleAsync();
        record.Outcome = "denied";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.Entry(record).State = EntityState.Deleted;
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData(1000, new int[0], 600, 1000)]          // one read per second fits the default budget
    [InlineData(1000, new[] { 1000 }, 90, 1334)]       // 120/min demand scaled to 90/min
    [InlineData(250, new[] { 250, 250, 250 }, 60, 4000)] // 960/min on a 60/min site: 16x slower
    [InlineData(1000, new[] { 500 }, 1, 180_000)]       // stretching is shared, not charged to the newcomer
    [InlineData(250, new int[0], 1, 250 * 240)]
    public void Polling_budget_scales_every_gateway_to_the_site_limit(int requested, int[] others, int budget, int expected)
    {
        Assert.Equal(expected, PollingBudget.Assign(requested, others, budget));
        // Every gateway applying its own assignment keeps the site within budget, or unchanged if it already fit.
        var all = others.Append(requested).ToArray();
        var demand = all.Sum(ms => 60_000d / ms);
        var total = all.Select((ms, i) => 60_000d / PollingBudget.Assign(ms, all.Where((_, j) => j != i), budget)).Sum();
        if (demand <= budget) Assert.Equal(demand, total, 9);
        else Assert.True(total <= budget + 1e-9, $"{total} polls/min exceeds {budget}");
    }

    [Fact]
    public void Egress_gate_denies_unless_every_rule_admits_the_transfer()
    {
        var open = new EgressDestination { Enabled = true, ClassificationCeiling = DataClassification.Confidential };
        var rules = EgressRules.DenyAll with
        {
            AllowedCategories = ["asset_inventory", "topology", "plc_configuration"],
            ProhibitedCategories = ["personal_data"], Approval = new(false, null)
        };
        Assert.Equal((EgressDecision.Allowed, "policy-allowed"),
            EgressGate.Decide(open, rules, [DataCategory.AssetInventory, DataCategory.Topology]));
        Assert.Equal("destination-disabled", EgressGate.Decide(null, rules, [DataCategory.AssetInventory]).Reason);
        Assert.Equal("destination-disabled",
            EgressGate.Decide(new EgressDestination { Enabled = false }, rules, [DataCategory.AssetInventory]).Reason);
        Assert.Equal("no-policy", EgressGate.Decide(open, null, [DataCategory.AssetInventory]).Reason);
        Assert.Equal("category-not-allowed", EgressGate.Decide(open, EgressRules.DenyAll, [DataCategory.AssetInventory]).Reason);
        Assert.Equal("prohibited-category",
            EgressGate.Decide(open, rules, [DataCategory.AssetInventory, DataCategory.PersonalData]).Reason);
        Assert.Equal("above-classification-ceiling", EgressGate.Decide(open, rules, [DataCategory.PlcConfiguration]).Reason);
        Assert.Equal((EgressDecision.PendingApproval, "approval-required"),
            EgressGate.Decide(open, rules with { Approval = new(true, "Administrator") }, [DataCategory.Topology]));
        Assert.All(new[] { DataCategory.RawTelemetry, DataCategory.PlcConfiguration, DataCategory.Recipes },
            x => Assert.Equal(DataClassification.Restricted, EgressGate.Classify(x)));
        Assert.True(EgressGate.Valid(rules));
        Assert.False(EgressGate.Valid(rules with { ProhibitedCategories = ["topology"] }));
        Assert.False(EgressGate.Valid(rules with { AllowedCategories = ["everything"] }));
        Assert.False(EgressGate.Valid(rules with { Aggregation = new(true, 1) }));
        Assert.False(EgressGate.Valid(rules with { Redaction = null! }));
    }

    private static AuditIntegrity SigningIntegrity() => AuditIntegrity.FromConfiguration(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Audit:KeyId"] = "test-v1",
            ["Audit:SigningKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)42, 32).ToArray())
        }).Build(), required: true);

    [Fact]
    public async Task Cross_tenant_write_is_rejected_before_database_access()
    {
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseSqlite("Data Source=:memory:").Options;
        await using var db = new WaylornDbContext(options, new TenantScope(Guid.NewGuid()));
        db.Assets.Add(new Asset { Id = Guid.NewGuid(), OrganizationId = Guid.NewGuid(), SiteId = Guid.NewGuid(), Name = "wrong tenant" });
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    private static ClaimsPrincipal Principal(Guid org, Guid site, string role) =>
        new(new ClaimsIdentity([
            new Claim("sub", "user-1"), new Claim("org_id", org.ToString()),
            new Claim("site_id", site.ToString()), new Claim("waylorn_role", role)
        ], "test"));

    private sealed class ReadinessClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class ReadinessHandler(Func<HttpRequestMessage, HttpResponseMessage> reply) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(reply(request));
    }
}
