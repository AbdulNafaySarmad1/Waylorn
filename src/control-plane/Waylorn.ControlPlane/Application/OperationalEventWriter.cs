using System.Text.Json;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public static class OperationalEventWriter
{
    public static void Add(WaylornDbContext db, Guid siteId, string kind, Guid targetId, string state, string actor)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Guid.NewGuid();
        db.Outbox.Add(new OutboxMessage
        {
            Id = id, OrganizationId = db.OrganizationId, SiteId = siteId,
            Destination = OutboxDestination.Operations,
            Subject = $"waylorn.operation.v1.{kind}",
            Payload = JsonSerializer.Serialize(new { schemaVersion = 1, eventId = id,
                organizationId = db.OrganizationId, siteId, targetId, state, actor, atUtc = now }, EventJson.Options),
            CreatedUtc = now, NextAttemptUtc = now
        });
    }
}
