using System.Text.Json;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public static class AuditWriter
{
    public static void Add(WaylornDbContext db, string principal, string action, string targetType,
        Guid targetId, Guid? siteId, string outcome = "succeeded")
    {
        var record = new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = siteId,
            Principal = principal, Action = action, TargetType = targetType,
            TargetId = targetId, Outcome = outcome, AtUtc = DateTimeOffset.UtcNow
        };
        db.Audit.Add(record);
        db.Outbox.Add(new OutboxMessage
        {
            Id = record.Id, OrganizationId = record.OrganizationId, SiteId = siteId,
            Destination = OutboxDestination.Audit, Subject = "waylorn.audit.v1",
            Payload = JsonSerializer.Serialize(new { schemaVersion = 1, eventId = record.Id, record.OrganizationId,
                record.SiteId, record.Principal, record.Action, record.TargetType, record.TargetId,
                record.Outcome, record.AtUtc }, EventJson.Options),
            CreatedUtc = record.AtUtc, NextAttemptUtc = record.AtUtc
        });
    }
}
