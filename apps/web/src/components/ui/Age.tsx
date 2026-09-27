'use client';

import { formatAge, formatTimestamp } from '@waylorn/domain';
import { useNow } from '@/lib/use-now';

/** Live-updating relative age, e.g. "12 s ago", with the absolute time on hover. */
export function Age({ iso, serverNow }: { iso: string | undefined; serverNow?: number }) {
  const now = useNow(serverNow);
  if (!iso) return <span className="muted">never</span>;
  return (
    <time dateTime={iso} title={formatTimestamp(iso, 'UTC')} className="nowrap" suppressHydrationWarning>
      {formatAge(iso, now)}
    </time>
  );
}
