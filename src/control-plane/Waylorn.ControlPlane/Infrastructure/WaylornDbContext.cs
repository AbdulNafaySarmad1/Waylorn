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
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetRelation> Relationships => Set<AssetRelation>();
    public DbSet<CommandRequest> Commands => Set<CommandRequest>();
    public DbSet<AuditRecord> Audit => Set<AuditRecord>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
            if (entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted &&
                entry.Entity.OrganizationId != OrganizationId)
                throw new InvalidOperationException("Cross-tenant write denied.");
        return base.SaveChangesAsync(cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
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
    }
}
