using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public enum RequestStatus { Created, Existing, Conflict }
public sealed record RequestResult(RequestStatus Status, CommandRequest? Command);

public sealed class CommandWorkflow(WaylornDbContext db)
{
    public async Task<RequestResult> RequestAsync(Asset asset, OperationKind operation, string ticket,
        DateTimeOffset windowStart, DateTimeOffset windowEnd, string key, string subject, CancellationToken ct)
    {
        var existing = await db.Commands.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Requester == subject && x.IdempotencyKey == key, ct);
        if (existing is not null)
            return existing.AssetId == asset.Id && existing.Operation == operation &&
                existing.ChangeTicket == ticket && existing.WindowStartUtc == windowStart &&
                existing.WindowEndUtc == windowEnd
                ? new(RequestStatus.Existing, existing) : new(RequestStatus.Conflict, null);

        var command = new CommandRequest
        {
            Id = Guid.NewGuid(), OrganizationId = db.OrganizationId, SiteId = asset.SiteId, AssetId = asset.Id,
            Operation = operation, Risk = CommandPolicy.Classify(operation, asset.Kind), State = CommandState.Pending,
            Requester = subject, IdempotencyKey = key, ChangeTicket = ticket,
            WindowStartUtc = windowStart, WindowEndUtc = windowEnd, RequestedUtc = DateTimeOffset.UtcNow
        };
        db.Commands.Add(command);
        AuditWriter.Add(db, subject, "command.request", "command", command.Id, asset.SiteId);
        AddControlEvent(command, "requested");
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { return new(RequestStatus.Conflict, null); }
        return new(RequestStatus.Created, command);
    }

    public async Task<bool> ApproveAsync(CommandRequest command, string approver, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        if (!CommandPolicy.IsApprovalReady(command, approver, now))
        {
            AuditWriter.Add(db, approver, "command.approve", "command", command.Id, command.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return false;
        }
        command.State = CommandState.Approved;
        command.Approver = approver;
        command.ApprovedUtc = now;
        command.Version++;
        AuditWriter.Add(db, approver, "command.approve", "command", command.Id, command.SiteId);
        AddControlEvent(command, "approval-recorded");
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return false; }
        return true;
    }

    private void AddControlEvent(CommandRequest command, string kind)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Guid.NewGuid();
        db.Outbox.Add(new OutboxMessage
        {
            Id = id, OrganizationId = command.OrganizationId, SiteId = command.SiteId,
            Destination = OutboxDestination.Control, Subject = $"waylorn.control.v1.{kind}",
            Payload = JsonSerializer.Serialize(new { schemaVersion = 1, eventId = id,
                command.OrganizationId, command.SiteId, commandId = command.Id, command.AssetId,
                command.Operation, command.Risk, command.State, atUtc = now }, EventJson.Options),
            CreatedUtc = now, NextAttemptUtc = now
        });
    }
}
