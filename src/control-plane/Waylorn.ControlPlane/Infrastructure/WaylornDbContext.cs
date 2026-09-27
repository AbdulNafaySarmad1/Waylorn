using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Domain;

namespace Waylorn.ControlPlane.Infrastructure;

public sealed class TenantScope(Guid organizationId)
{
    public Guid OrganizationId { get; } = organizationId;
}

public sealed class WaylornDbContext(DbContextOptions<WaylornDbContext> options, TenantScope scope) : DbContext(options)
{
    public Guid OrganizationId => scope.OrganizationId;
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Site> Sites => Set<Site>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetRelation> Relationships => Set<AssetRelation>();
    public DbSet<CommandRequest> Commands => Set<CommandRequest>();
    public DbSet<AuditRecord> Audit => Set<AuditRecord>();
    public DbSet<TelemetrySample> Telemetry => Set<TelemetrySample>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
            if (entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted &&
                entry.Entity.OrganizationId != OrganizationId)
                throw new InvalidOperationException("Cross-tenant write denied.");
        foreach (var entry in ChangeTracker.Entries<Organization>())
            if (entry.State is EntityState.Added or EntityState.Modified && entry.Entity.Id != OrganizationId)
                throw new InvalidOperationException("Organization identity does not match tenant scope.");
        return base.SaveChangesAsync(cancellationToken);
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
            e.HasIndex(x => new { x.OrganizationId, x.AtUtc });
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
