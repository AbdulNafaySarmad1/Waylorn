using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Infrastructure;

namespace Waylorn.ControlPlane.Application;

public sealed record AuditChainBreak(long Sequence, string Reason);
public sealed record AuditChainReport(string State, long Checked, long HeadSequence, AuditChainBreak? FirstBreak);

// Walks one organization's audit chain in sequence order. Deletion shows as a missing sequence,
// reordering or relinking as a broken tag or predecessor, and tail truncation as a head mismatch.
// Without signing keys only structure is checked and the state is "unverified", never "intact".
// An operator with both database write access and the signing key can rewrite the whole chain;
// the published waylorn.audit.v1 stream is the external anchor against that.
public static class AuditChain
{
    private const int PageSize = 500;

    public static async Task<AuditChainReport> VerifyAsync(WaylornDbContext db, CancellationToken ct)
    {
        var head = await db.AuditHeads.AsNoTracking().SingleOrDefaultAsync(ct);
        long last = 0;
        string? previous = null;
        var unverified = false;
        AuditChainBreak? found = null;
        while (found is null)
        {
            var page = await db.Audit.AsNoTracking()
                .Where(x => x.ChainSequence > last).OrderBy(x => x.ChainSequence).Take(PageSize).ToListAsync(ct);
            foreach (var record in page)
            {
                var sequence = record.ChainSequence!.Value;
                if (sequence != last + 1) found = new(last + 1, "missing");
                else if (record.PreviousTag != previous) found = new(sequence, "relinked");
                else switch (db.Integrity.Verify(record))
                {
                    case "broken": found = new(sequence, "tampered"); break;
                    case "unverified": unverified = true; break;
                }
                if (found is not null) break;
                previous = record.IntegrityTag;
                last = sequence;
            }
            if (page.Count < PageSize) break;
        }
        found ??= (head?.Sequence ?? 0) switch
        {
            var h when h > last => new(last + 1, "truncated"),
            var h when h < last => new(h + 1, "beyond-head"),
            _ when head is not null && head.Tag != previous => new(last, "head-mismatch"),
            _ => null
        };
        var state = found is not null ? "broken" : unverified ? "unverified" : "intact";
        return new(state, last, head?.Sequence ?? 0, found);
    }
}
