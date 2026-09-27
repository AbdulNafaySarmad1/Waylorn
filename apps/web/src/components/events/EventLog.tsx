'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { eventCategoryValues, severityValues, type AssetEvent, type EventCategory, type Severity } from '@waylorn/contracts';
import { formatTimestamp, humanizeToken, presentProblem, SEVERITY, type ProblemPresentation } from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { SeverityStatus } from '@/components/ui/Status';
import { bff } from '@/lib/bff';
import styles from './EventLog.module.css';

const ROW = 32;
const PAGE = 100;
/** Upper bound on events held in memory; beyond this the operator narrows the filter. */
const MAX_LOADED = 5000;

/**
 * Asset event log. Server-side filtering and cursor pages; rows are virtualised so only
 * visible rows are in the DOM regardless of how many pages have been loaded.
 */
export function EventLog({ orgId, assetId, timeZone }: { orgId: string; assetId: string; timeZone: string }) {
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();
  const [total, setTotal] = useState<number | undefined>();
  const viewport = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (after: string | undefined, gen: number) => {
      setLoading(true);
      const { data, error, response } = await bff().GET('/orgs/{orgId}/assets/{assetId}/events', {
        params: {
          path: { orgId, assetId },
          query: { limit: PAGE, ...(after ? { cursor: after } : {}), ...(severity ? { severity } : {}), ...(category ? { category } : {}) },
        },
      });
      if (gen !== generation.current) return;
      setLoading(false);
      if (!data) {
        setProblem(presentProblem(error, response.status));
        return;
      }
      setProblem(undefined);
      setTotal(data.page.totalEstimate);
      setEvents((cur) => (after ? [...cur, ...data.items] : data.items));
      setCursor(data.page.nextCursor);
      setDone(!data.page.nextCursor);
    },
    [assetId, category, orgId, severity],
  );

  useEffect(() => {
    generation.current += 1;
    setEvents([]);
    setCursor(undefined);
    setDone(false);
    void fetchPage(undefined, generation.current);
  }, [fetchPage]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is used without the React Compiler
  const virtualizer = useVirtualizer({ count: events.length, getScrollElement: () => viewport.current, estimateSize: () => ROW, overscan: 12 });
  const items = virtualizer.getVirtualItems();
  const last = items.at(-1);
  const atCap = events.length >= MAX_LOADED;

  useEffect(() => {
    if (!last || loading || done || atCap) return;
    if (last.index >= events.length - 20) void fetchPage(cursor, generation.current);
  }, [atCap, cursor, done, events.length, fetchPage, last, loading]);

  return (
    <>
      <div className={styles.toolbar}>
        <label style={{ display: 'grid', gap: 2, fontSize: 'var(--text-xs)' }}>
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
            <option value="">All</option>
            {severityValues.map((s) => (
              <option key={s} value={s}>
                {SEVERITY[s].label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 2, fontSize: 'var(--text-xs)' }}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory | '')}>
            <option value="">All</option>
            {eventCategoryValues.map((c) => (
              <option key={c} value={c}>
                {humanizeToken(c)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }} aria-live="polite">
          {events.length.toLocaleString('en-GB')} loaded{total !== undefined ? ` of about ${total.toLocaleString('en-GB')}` : ''}
        </span>
      </div>
      {problem ? <ErrorState problem={problem} /> : null}
      <div role="table" aria-label="Asset events" aria-rowcount={total ?? events.length}>
        <div role="rowgroup">
          <div role="row" className={styles.header}>
            <span role="columnheader">Occurred ({timeZone})</span>
            <span role="columnheader">Severity</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Message</span>
            <span role="columnheader" className={styles.hideNarrow}>
              Source
            </span>
          </div>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable row container must be keyboard-scrollable (axe scrollable-region-focusable) */}
        <div ref={viewport} className={styles.viewport} role="rowgroup" tabIndex={0} aria-label="Event rows, scroll to load older events">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((v) => {
              const e = events[v.index];
              if (!e) return null;
              return (
                <div
                  key={e.id}
                  role="row"
                  aria-rowindex={v.index + 1}
                  className={`${styles.row} ${e.severity === 'critical' ? styles.critical : e.severity === 'warning' ? styles.warning : ''}`}
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  <span role="cell" className="nowrap">
                    {formatTimestamp(e.occurredAt, timeZone)}
                  </span>
                  <span role="cell">
                    <SeverityStatus severity={e.severity} />
                  </span>
                  <span role="cell">{humanizeToken(e.category)}</span>
                  <span role="cell">{e.message}</span>
                  <span role="cell" className={`mono ${styles.hideNarrow}`}>
                    {e.source}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        {loading ? <span role="status">Loading older events…</span> : null}
        {done && events.length > 0 ? <span>Beginning of history for this filter.</span> : null}
        {atCap ? <span>Showing the most recent {MAX_LOADED.toLocaleString('en-GB')} events. Narrow the filter to see older ones.</span> : null}
        {!done && !atCap && !loading ? (
          <Button small onClick={() => void fetchPage(cursor, generation.current)}>
            Load older events
          </Button>
        ) : null}
      </div>
    </>
  );
}
