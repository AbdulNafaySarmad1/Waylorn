using System.Security.Claims;
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
}
