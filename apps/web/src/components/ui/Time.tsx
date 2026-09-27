import { formatTimestamp } from '@waylorn/domain';

/** Absolute timestamp in an explicit zone, with the UTC instant available on hover. */
export function Timestamp({ iso, timeZone = 'UTC', seconds = true }: { iso: string | undefined; timeZone?: string; seconds?: boolean }) {
  if (!iso) return <span className="muted">—</span>;
  return (
    <time dateTime={iso} title={formatTimestamp(iso, 'UTC')} className="nowrap">
      {formatTimestamp(iso, timeZone, { seconds })}
    </time>
  );
}
