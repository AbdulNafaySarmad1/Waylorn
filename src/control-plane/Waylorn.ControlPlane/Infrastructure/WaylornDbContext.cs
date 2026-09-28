using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Infrastructure;

public sealed class TenantScope(Guid organizationId)
{
    public Guid OrganizationId { get; } = organizationId;
}

public sealed class WaylornDbContext : DbContext
{
    private readonly TenantScope scope;
    public AuditIntegrity Integrity { get; }

    public WaylornDbContext(DbContextOptions<WaylornDbContext> options, TenantScope scope,
        AuditIntegrity integrity) : base(options)
    {
        this.scope = scope;
        Integrity = integrity;
    }

    public WaylornDbContext(DbContextOptions<WaylornDbContext> options, TenantScope scope)
        : this(options, scope, AuditIntegrity.Disabled) { }

    public Guid OrganizationId => scope.OrganizationId;
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetRelation> Relationships => Set<AssetRelation>();
    public DbSet<CommandRequest> Commands => Set<CommandRequest>();
    public DbSet<AuditRecord> Audit => Set<AuditRecord>();
    public DbSet<TelemetrySample> Telemetry => Set<TelemetrySample>();
    public DbSet<SiteAgentHeartbeat> SiteAgentHeartbeats => Set<SiteAgentHeartbeat>();
    public DbSet<Incident> Incidents => Set<Incident>();
    public DbSet<IncidentAsset> IncidentAssets => Set<IncidentAsset>();
    public DbSet<MaintenanceWorkOrder> WorkOrders => Set<MaintenanceWorkOrder>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();
    public DbSet<EgressDestination> EgressDestinations => Set<EgressDestination>();
    public DbSet<EgressPolicy> EgressPolicies => Set<EgressPolicy>();
    public DbSet<EgressRecord> EgressRecords => Set<EgressRecord>();

    public DbSet<AuditChainHead> AuditHeads => Set<AuditChainHead>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess) =>
        ChangeTracker.Entries<AuditRecord>().Any(x => x.State == EntityState.Added)
            ? throw new InvalidOperationException("Audit records must be saved asynchronously so they are chained.")
            : base.SaveChanges(acceptAllChangesOnSuccess);

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
            if (entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted &&
                entry.Entity.OrganizationId != OrganizationId)
                throw new InvalidOperationException("Cross-tenant write denied.");
        foreach (var entry in ChangeTracker.Entries<Organization>())
            if (entry.State is EntityState.Added or EntityState.Modified && entry.Entity.Id != OrganizationId)
                throw new InvalidOperationException("Organization identity does not match tenant scope.");
        foreach (var entry in ChangeTracker.Entries<AuditRecord>())
            if (entry.State is EntityState.Modified or EntityState.Deleted)
                throw new InvalidOperationException("Audit records are append-only.");

        var pending = ChangeTracker.Entries<AuditRecord>().Where(x => x.State == EntityState.Added)
            .Select(x => x.Entity).OrderBy(x => x.AtUtc).ThenBy(x => x.Id).ToList();
        if (pending.Count == 0) return await base.SaveChangesAsync(cancellationToken);

        // ponytail: audit appends serialize per organization; shard the chain per site if write volume demands it.
        var transaction = Database.CurrentTransaction is null
            ? await Database.BeginTransactionAsync(cancellationToken) : null;
        AuditChainHead? head = null;
        try
        {
            if (Database.IsNpgsql())
                await Database.ExecuteSqlAsync(
                    $"SELECT pg_advisory_xact_lock({BitConverter.ToInt64(OrganizationId.ToByteArray())})",
                    cancellationToken);
            head = await AuditHeads.AsNoTracking().SingleOrDefaultAsync(cancellationToken);
            if (head is null) AuditHeads.Add(head = new AuditChainHead { OrganizationId = OrganizationId });
            else AuditHeads.Update(head);
            foreach (var record in pending)
            {
                record.ChainSequence = ++head.Sequence;
                record.PreviousTag = head.Tag;
                Integrity.Sign(record);
                head.Tag = record.IntegrityTag;
                var outbox = ChangeTracker.Entries<OutboxMessage>().FirstOrDefault(x => x.Entity.Id == record.Id);
                if (outbox is not null) outbox.Entity.Payload = AuditWriter.Payload(record);
            }
            var written = await base.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return written;
        }
        finally
        {
            // The head is always re-read under the lock, never trusted from an earlier save.
            if (head is not null) Entry(head).State = EntityState.Detached;
            if (transaction is not null) await transaction.DisposeAsync();
        }
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Organization>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Slug).HasMaxLength(80);
            e.Property(x => x.Name).HasMaxLength(200);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasQueryFilter(x => x.Id == OrganizationId);
        });
        model.Entity<Site>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.OrganizationId, x.Id });
            e.HasOne<Organization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.RegionName).HasMaxLength(120);
            e.Property(x => x.Timezone).HasMaxLength(80);
            e.Property(x => x.Environment).HasMaxLength(20);
            e.Property(x => x.MaxPollsPerMinute).HasDefaultValue(600);
            e.HasIndex(x => new { x.OrganizationId, x.Code }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<Zone>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Site>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.SiteId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.Name).HasMaxLength(200);
            e.HasIndex(x => new { x.OrganizationId, x.SiteId, x.Code }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<Asset>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.OrganizationId, x.Id });
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Manufacturer).HasMaxLength(200);
            e.Property(x => x.Model).HasMaxLength(200);
            e.Property(x => x.Serial).HasMaxLength(200);
            e.Property(x => x.Firmware).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => new { x.OrganizationId, x.SiteId, x.Deleted });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId && !x.Deleted);
        });
        model.Entity<AssetRelation>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.SourceAssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.TargetAssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32);
            e.HasIndex(x => new { x.OrganizationId, x.SourceAssetId, x.TargetAssetId, x.Kind }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<CommandRequest>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.AssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Operation).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Risk).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.State).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Requester).HasMaxLength(200);
            e.Property(x => x.Approver).HasMaxLength(200);
            e.Property(x => x.ChangeTicket).HasMaxLength(200);
            e.Property(x => x.IdempotencyKey).HasMaxLength(128);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => new { x.OrganizationId, x.Requester, x.IdempotencyKey }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<AuditRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Principal).HasMaxLength(200);
            e.Property(x => x.Action).HasMaxLength(100);
            e.Property(x => x.TargetType).HasMaxLength(100);
            e.Property(x => x.Outcome).HasMaxLength(100);
            e.Property(x => x.IntegrityKeyId).HasMaxLength(40);
            e.Property(x => x.IntegrityTag).HasMaxLength(64);
            e.Property(x => x.PreviousTag).HasMaxLength(64);
            e.HasIndex(x => new { x.OrganizationId, x.AtUtc });
            e.HasIndex(x => new { x.OrganizationId, x.ChainSequence }).IsUnique();
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<AuditChainHead>(e =>
        {
            e.HasKey(x => x.OrganizationId);
            e.Property(x => x.Tag).HasMaxLength(64);
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<TelemetrySample>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.AssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.SignalKey).HasMaxLength(80);
            e.Property(x => x.Source).HasMaxLength(120);
            e.HasIndex(x => new { x.OrganizationId, x.RequestId, x.SignalKey }).IsUnique();
            e.HasIndex(x => new { x.OrganizationId, x.AssetId, x.SignalKey, x.ObservedUtc });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<SiteAgentHeartbeat>(e =>
        {
            e.HasKey(x => new { x.OrganizationId, x.SiteId, x.AgentId });
            e.HasOne<Site>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.SiteId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.AgentId).HasMaxLength(200);
            e.HasIndex(x => new { x.OrganizationId, x.SiteId, x.LastSeenUtc });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<Incident>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.OrganizationId, x.Id });
            e.HasOne<Site>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.SiteId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.PrimaryAssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Severity).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.OpenedBy).HasMaxLength(200);
            e.Property(x => x.Owner).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => new { x.OrganizationId, x.SiteId, x.OpenedUtc });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<IncidentAsset>(e =>
        {
            e.HasKey(x => new { x.OrganizationId, x.IncidentId, x.AssetId });
            e.HasOne<Incident>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.IncidentId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.AssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<MaintenanceWorkOrder>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<Site>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.SiteId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Asset>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.AssetId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.CreatedBy).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => new { x.OrganizationId, x.SiteId, x.AssetId });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<EgressDestination>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => new { x.OrganizationId, x.Id });
            e.Property(x => x.DisplayName).HasMaxLength(200);
            e.Property(x => x.ProviderClass).HasMaxLength(40);
            e.Property(x => x.Endpoint).HasMaxLength(500);
            e.Property(x => x.Model).HasMaxLength(200);
            e.Property(x => x.Locality).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.ClassificationCeiling).HasConversion<string>().HasMaxLength(20);
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<EgressPolicy>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasOne<EgressDestination>().WithMany().HasForeignKey(x => new { x.OrganizationId, x.DestinationId })
                .HasPrincipalKey(x => new { x.OrganizationId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.OrganizationId, x.DestinationId }).IsUnique();
            e.Property(x => x.Version).IsConcurrencyToken();
            e.Property(x => x.Rules).HasMaxLength(20_000);
            e.Property(x => x.UpdatedBy).HasMaxLength(200);
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<EgressRecord>(e =>
        {
            // No foreign key: a decision for an unknown destination is recorded, not rejected.
            e.HasKey(x => x.Id);
            e.Property(x => x.Categories).HasMaxLength(300);
            e.Property(x => x.Decision).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Reason).HasMaxLength(60);
            e.Property(x => x.Actor).HasMaxLength(200);
            e.Property(x => x.ActorType).HasMaxLength(20);
            e.HasIndex(x => new { x.OrganizationId, x.AtUtc });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
        model.Entity<OutboxMessage>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Destination).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Subject).HasMaxLength(160);
            e.Property(x => x.LastError).HasMaxLength(500);
            e.HasIndex(x => new { x.PublishedUtc, x.NextAttemptUtc, x.LeaseUntilUtc });
            e.HasQueryFilter(x => x.OrganizationId == OrganizationId);
        });
    }
}
