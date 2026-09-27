'use client';

import type { LiveSignal } from '@waylorn/contracts';
import { classifyFreshness, formatAge, formatDuration, formatWithUnit, LIMIT_LABEL, limitState } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { DegradedNotice } from '@/components/ui/States';
import { FreshnessStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { useNow } from '@/lib/use-now';
import { useLiveStream, type StreamState } from './useLiveStream';

const STREAM_LABEL: Record<StreamState, string> = {
  connecting: 'Connecting to live stream…',
  connected: 'Live stream connected',
  silent: 'Live stream open but silent — no heartbeat',
  disconnected: 'Live stream disconnected',
};

function formatValue(s: LiveSignal): string {
  if (typeof s.value === 'number') return formatWithUnit(s.value, s.unit, 2);
  if (s.value === null) return '—';
  return String(s.value);
}

export function LiveSignals({ url, initial, serverNow }: { url: string; initial: readonly LiveSignal[]; serverNow: number }) {
  const { signals, state, lastHeartbeatAt, retryAt } = useLiveStream(url, initial);
  const now = useNow(serverNow);
  const connected = state === 'connected';
  const rows = [...signals.values()];

  return (
    <>
      <div style={{ padding: '8px 16px', display: 'flex', gap: 16, alignItems: 'center', fontSize: 'var(--text-sm)' }} role="status" aria-live="polite">
        <span className="nowrap">
          <Glyph shape={connected ? 'check' : state === 'connecting' ? 'dot' : 'triangle'} /> {STREAM_LABEL[state]}
        </span>
        {lastHeartbeatAt ? <span className="muted" suppressHydrationWarning>last heartbeat {formatAge(new Date(lastHeartbeatAt).toISOString(), now)}</span> : null}
        {retryAt ? <span className="muted" suppressHydrationWarning>retrying in {formatDuration(Math.max(0, retryAt - now))}</span> : null}
      </div>
      {!connected && state !== 'connecting' ? (
        <DegradedNotice>
          Values below are the <strong>last known</strong> values and are marked Unknown. Do not use them to judge the current state of the
          equipment.
        </DegradedNotice>
      ) : null}
      <DataTable label="Live signals" caption="Freshness compares each value's observation time with the signal's expected update interval.">
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col" className={tableStyles.num}>
              Value
            </th>
            <th scope="col">Limits</th>
            <th scope="col">Quality</th>
            <th scope="col">Freshness</th>
            <th scope="col">Observed</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const freshness = classifyFreshness({ observedAt: s.observedAt, expectedIntervalMs: s.expectedIntervalMs, streamConnected: connected }, now);
            const limit = limitState(s);
            const alarm = limit === 'high_alarm' || limit === 'low_alarm';
            const warn = limit === 'high_warning' || limit === 'low_warning';
            return (
              <tr key={s.key} className={alarm ? tableStyles.rowFault : warn ? tableStyles.rowWarning : undefined} data-freshness={freshness}>
                <th scope="row">
                  {s.label}
                  <span className={`${tableStyles.sub} mono`}>{s.key}</span>
                </th>
                <td className={tableStyles.num} style={freshness === 'fresh' ? undefined : { color: 'var(--text-muted)' }}>
                  {formatValue(s)}
                </td>
                <td>
                  {limit === 'not_applicable' ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="nowrap" style={alarm ? { color: 'var(--status-fault)', fontWeight: 600 } : warn ? { color: 'var(--status-warning)' } : undefined}>
                      {alarm || warn ? <Glyph shape={alarm ? 'cross' : 'triangle'} /> : null} {LIMIT_LABEL[limit]}
                    </span>
                  )}
                </td>
                <td>{s.quality === 'good' ? 'Good' : s.quality === 'uncertain' ? 'Uncertain' : 'Bad'}</td>
                <td>
                  <FreshnessStatus freshness={freshness} />
                </td>
                <td suppressHydrationWarning>
                  {formatAge(s.observedAt, now)}
                  <span className={tableStyles.sub}>every {formatDuration(s.expectedIntervalMs)}</span>
                </td>
                <td className="mono">{s.source}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </>
  );
}
