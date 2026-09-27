using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public static class AuditWriter
{
    public static void Add(WaylornDbContext db, string principal, string action, string targetType,
        Guid targetId, Guid? siteId, string outcome = "succeeded") =>
        db.Audit.Add(new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = siteId,
            Principal = principal, Action = action, TargetType = targetType,
            TargetId = targetId, Outcome = outcome, AtUtc = DateTimeOffset.UtcNow
        });
}
