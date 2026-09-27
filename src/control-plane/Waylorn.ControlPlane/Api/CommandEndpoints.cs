using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Domain;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Api;

public sealed record CommandInput(Guid AssetId, OperationKind Operation, string? ChangeTicket,
    DateTimeOffset? WindowStartUtc, DateTimeOffset? WindowEndUtc);

public static class CommandEndpoints
{
    public static void MapCommandEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/commands", RequestCommand);
        api.MapGet("/commands/{id:guid}", GetCommand);
        api.MapPost("/commands/{id:guid}/approve", ApproveCommand);
    }

    private static async Task<IResult> RequestCommand(CommandInput input, HttpContext http, WaylornDbContext db,
        CommandWorkflow workflow, CancellationToken ct)
    {
        var asset = await db.Assets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == input.AssetId, ct);
        if (asset is null) return Results.NotFound();
        if (!AccessPolicy.CanRequest(http.User, asset.SiteId))
        {
            AuditWriter.Add(db, AccessPolicy.Subject(http.User), "command.request", "asset", asset.Id, asset.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        if (!Enum.IsDefined(input.Operation) || CommandPolicy.Classify(input.Operation) == RiskClass.Green ||
            string.IsNullOrWhiteSpace(input.ChangeTicket) || input.ChangeTicket.Length > 200 ||
            input.WindowStartUtc is null || input.WindowEndUtc is null || input.WindowEndUtc <= input.WindowStartUtc)
            return Results.BadRequest();
        if (CommandPolicy.Classify(input.Operation, asset.Kind) != RiskClass.Amber)
        {
            AuditWriter.Add(db, AccessPolicy.Subject(http.User), "command.request", "asset", asset.Id, asset.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Problem(statusCode: 403, detail: "RED operations require a separate site safety case and are unavailable.");
        }
        var key = http.Request.Headers["Idempotency-Key"].ToString();
        if (key.Length is < 16 or > 128) return Results.BadRequest();
        var ticket = input.ChangeTicket.Trim();
        var subject = AccessPolicy.Subject(http.User);
        if (string.IsNullOrEmpty(subject)) return Results.Forbid();
        var result = await workflow.RequestAsync(asset, input.Operation, ticket,
            input.WindowStartUtc.Value, input.WindowEndUtc.Value, key, subject, ct);
        return result.Status switch
        {
            RequestStatus.Created => Results.Created($"/api/v1/commands/{result.Command!.Id}", result.Command),
            RequestStatus.Existing => Results.Ok(result.Command),
            _ => Results.Conflict()
        };
    }

    private static async Task<IResult> GetCommand(Guid id, HttpContext http, WaylornDbContext db, CancellationToken ct)
    {
        var command = await db.Commands.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (command is null) return Results.NotFound();
        return AccessPolicy.CanRead(http.User, command.SiteId) || AccessPolicy.CanApprove(http.User, command.SiteId)
            ? Results.Ok(command) : Results.Forbid();
    }

    private static async Task<IResult> ApproveCommand(Guid id, HttpContext http, WaylornDbContext db,
        CommandWorkflow workflow, CancellationToken ct)
    {
        var command = await db.Commands.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (command is null) return Results.NotFound();
        if (!AccessPolicy.CanApprove(http.User, command.SiteId))
        {
            AuditWriter.Add(db, AccessPolicy.Subject(http.User), "command.approve", "command", id, command.SiteId, "denied");
            await db.SaveChangesAsync(ct);
            return Results.Forbid();
        }
        var approver = AccessPolicy.Subject(http.User);
        if (!await workflow.ApproveAsync(command, approver, ct))
            return Results.Problem(statusCode: 409, detail: "Approval conditions not met.");
        return Results.Ok(command);
    }
}
