'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TelemetrySeries } from '@waylorn/contracts';
import { formatNumber, formatTimestamp, formatWithUnit, humanizeToken } from '@waylorn/domain';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { linear, niceTicks, paddedExtent } from './scale';
import styles from './TelemetryChart.module.css';

const HEIGHT = 280;
const M = { top: 8, right: 16, bottom: 28, left: 56 };

interface Point {
  readonly t: number;
  readonly min: number;
  readonly mean: number;
  readonly max: number;
  readonly count: number;
}

function timeTick(t: number, spanMs: number, timeZone: string): string {
  const iso = new Date(t).toISOString();
  if (spanMs <= 36 * 3600_000) return formatTimestamp(iso, timeZone, { date: false, seconds: false }).replace(/ \S+$/, '');
  return formatTimestamp(iso, timeZone, { seconds: false }).slice(5, 16);
}

/**
 * Aggregated telemetry: mean line with min–max band, gaps hatched and labelled, one y-axis.
 * Pointer and keyboard (←/→) inspection; a data table is available for screen readers.
 */
export function TelemetryChart({ series, from, to, timeZone }: { series: TelemetrySeries; from: string; to: string; timeZone: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [active, setActive] = useState<number | undefined>();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points: Point[] = useMemo(
    () =>
      series.buckets
        .filter((b) => b.mean !== undefined)
        .map((b) => ({ t: Date.parse(b.t), min: b.min ?? b.mean ?? 0, mean: b.mean ?? 0, max: b.max ?? b.mean ?? 0, count: b.count })),
    [series.buckets],
  );

  const t0 = Date.parse(from);
  const t1 = Date.parse(to);
  const x = linear([t0, t1], [M.left, width - M.right]);
  const [y0, y1] = paddedExtent(points.flatMap((p) => [p.min, p.max]));
  const y = linear([y0, y1], [HEIGHT - M.bottom, M.top]);
  const yTicks = niceTicks(y0, y1, 5);
  const xTicks = niceTicks(t0, t1, Math.max(3, Math.floor(width / 140)));
  const bucketMs = series.resolutionSeconds * 1000;

  // Split into runs so lines and bands do not bridge missing buckets.
  const runs: Point[][] = [];
  for (const p of points) {
    const run = runs.at(-1);
    const prev = run?.at(-1);
    if (run && prev && p.t - prev.t <= bucketMs * 1.5) run.push(p);
    else runs.push([p]);
  }
  const linePath = runs.map((r) => r.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.mean).toFixed(1)}`).join('')).join('');
  const bandPath = runs
    .map((r) => {
      const top = r.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.max).toFixed(1)}`).join('');
      const bottom = [...r].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.min).toFixed(1)}`).join('');
      return `${top}${bottom}Z`;
    })
    .join('');

  const nearest = (px: number): number | undefined => {
    if (points.length === 0) return undefined;
    const t = t0 + ((px - M.left) / (width - M.left - M.right)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs((points[i]?.t ?? 0) - t) < Math.abs((points[best]?.t ?? 0) - t)) best = i;
    }
    return best;
  };

  const ap = active === undefined ? undefined : points[active];
  const summary = `${series.label}: ${points.length} aggregated points from ${formatTimestamp(from, timeZone)} to ${formatTimestamp(to, timeZone)}. Use left and right arrow keys to inspect values.`;

  return (
    <div className={styles.wrap} ref={wrap}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={styles.swatchLine} />
          Mean per {formatNumber(series.resolutionSeconds, 0)} s bucket
        </span>
        <span>
          <span className={styles.swatchBand} />
          Min–max range in bucket
        </span>
        {series.gaps.length > 0 ? (
          <span>
            <span className={styles.swatchGap} />
            No data
          </span>
        ) : null}
      </div>
      <svg
        className={styles.svg}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
        onPointerLeave={() => setActive(undefined)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, points.length - 1));
          else if (e.key === 'ArrowLeft') setActive((i) => Math.max((i ?? points.length) - 1, 0));
          else if (e.key === 'Escape') setActive(undefined);
          else return;
          e.preventDefault();
        }}
      >
        <defs>
          <pattern id="gap-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--gap-hatch)" strokeWidth="2" />
          </pattern>
        </defs>
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className={styles.grid} x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} />
            <text className={styles.tickLabel} x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {formatNumber(v, 2)}
            </text>
          </g>
        ))}
        <text className={styles.tickLabel} x={4} y={M.top + 4} dominantBaseline="hanging">
          {series.unit ?? ''}
        </text>
        {xTicks.map((t) => (
          <text key={`x${t}`} className={styles.tickLabel} x={x(t)} y={HEIGHT - 8} textAnchor="middle">
            {timeTick(t, t1 - t0, timeZone)}
          </text>
        ))}
        <line className={styles.axis} x1={M.left} x2={width - M.right} y1={HEIGHT - M.bottom} y2={HEIGHT - M.bottom} />
        {series.gaps.map((g) => {
          const gx0 = x(Math.max(t0, Date.parse(g.from)));
          const gx1 = x(Math.min(t1, Date.parse(g.to)));
          return (
            <g key={`${g.from}-${g.reason}`}>
              <rect className={styles.gap} x={gx0} y={M.top} width={Math.max(2, gx1 - gx0)} height={HEIGHT - M.top - M.bottom} />
              {gx1 - gx0 > 80 ? (
                <text className={styles.gapLabel} x={(gx0 + gx1) / 2} y={M.top + 14} textAnchor="middle">
                  {humanizeToken(g.reason)}
                </text>
              ) : null}
            </g>
          );
        })}
        <path className={styles.band} d={bandPath} />
        <path className={styles.line} d={linePath} />
        {ap ? (
          <>
            <line className={styles.crosshair} x1={x(ap.t)} x2={x(ap.t)} y1={M.top} y2={HEIGHT - M.bottom} />
            <circle className={styles.marker} cx={x(ap.t)} cy={y(ap.mean)} r={4} />
          </>
        ) : null}
      </svg>
      {ap ? (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(x(ap.t) + 28, width - 170), top: 36 }}
          role="status"
          aria-live="polite"
        >
          <strong>{formatTimestamp(new Date(ap.t).toISOString(), timeZone)}</strong>
          <span>Mean {formatWithUnit(ap.mean, series.unit)}</span>
          <span>
            Range {formatWithUnit(ap.min, series.unit)} – {formatWithUnit(ap.max, series.unit)}
          </span>
          <span className="muted">{ap.count.toLocaleString('en-GB')} samples</span>
        </div>
      ) : null}
      <details style={{ marginTop: 12 }}>
        <summary>Data table ({points.length} rows)</summary>
        <DataTable label={`${series.label} data`}>
          <thead>
            <tr>
              <th scope="col">Bucket start</th>
              <th scope="col" className={tableStyles.num}>Min</th>
              <th scope="col" className={tableStyles.num}>Mean</th>
              <th scope="col" className={tableStyles.num}>Max</th>
              <th scope="col" className={tableStyles.num}>Samples</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t}>
                <td>{formatTimestamp(new Date(p.t).toISOString(), timeZone)}</td>
                <td className={tableStyles.num}>{formatNumber(p.min, 2)}</td>
                <td className={tableStyles.num}>{formatNumber(p.mean, 2)}</td>
                <td className={tableStyles.num}>{formatNumber(p.max, 2)}</td>
                <td className={tableStyles.num}>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </details>
    </div>
  );
}
