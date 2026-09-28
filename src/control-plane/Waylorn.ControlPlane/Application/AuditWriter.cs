using System.Text.Json;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public static class AuditWriter
{
    // The chain position and integrity tag are assigned when the context saves; the outbox
    // payload is written then too, so the published event carries the sealed values.
    public static void Add(WaylornDbContext db, string principal, string action, string targetType,
        Guid targetId, Guid? siteId, string outcome = "succeeded")
    {
        var record = new AuditRecord
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = siteId,
            Principal = principal, Action = action, TargetType = targetType,
            TargetId = targetId, Outcome = outcome,
            AtUtc = new DateTimeOffset(DateTime.UtcNow.Ticks / 10 * 10, TimeSpan.Zero)
        };
        db.Audit.Add(record);
        db.Outbox.Add(new OutboxMessage
        {
            Id = record.Id, OrganizationId = record.OrganizationId, SiteId = siteId,
            Destination = OutboxDestination.Audit, Subject = "waylorn.audit.v1",
            CreatedUtc = record.AtUtc, NextAttemptUtc = record.AtUtc
        });
    }

    public static string Payload(AuditRecord record) => JsonSerializer.Serialize(new
    {
        schemaVersion = 1, eventId = record.Id, record.OrganizationId, record.SiteId, record.Principal,
        record.Action, record.TargetType, record.TargetId, record.Outcome, record.AtUtc,
        record.IntegrityKeyId, record.IntegrityTag, record.ChainSequence, record.PreviousTag
    }, EventJson.Options);
}
