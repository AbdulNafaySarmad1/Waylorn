import type { TelemetrySeries } from '@waylorn/contracts';

/** Absolute cap on buckets the browser will accept (architecture §5). */
export const MAX_SERIES_POINTS = 2000;
export const DEFAULT_SERIES_POINTS = 600;

export const TIME_RANGES = [
  { id: '1h', label: '1 hour', ms: 3_600_000 },
  { id: '12h', label: '12 hours (shift)', ms: 43_200_000 },
  { id: '24h', label: '24 hours', ms: 86_400_000 },
  { id: '7d', label: '7 days', ms: 604_800_000 },
  { id: '30d', label: '30 days', ms: 2_592_000_000 },
] as const;

export type TimeRangeId = (typeof TIME_RANGES)[number]['id'];

export function parseTimeRange(value: string | null | undefined): TimeRangeId {
  return TIME_RANGES.find((r) => r.id === value)?.id ?? '24h';
}

export function rangeBounds(id: TimeRangeId, nowMs: number): { from: string; to: string } {
  const range = TIME_RANGES.find((r) => r.id === id) ?? TIME_RANGES[2];
  return { from: new Date(nowMs - range.ms).toISOString(), to: new Date(nowMs).toISOString() };
}

export class SeriesBudgetError extends Error {
  constructor(readonly received: number) {
    super(`Telemetry series has ${received} buckets; the client limit is ${MAX_SERIES_POINTS}.`);
    this.name = 'SeriesBudgetError';
  }
}

/** Rejects oversized responses instead of rendering them. */
export function assertSeriesWithinBudget(series: TelemetrySeries): TelemetrySeries {
  if (series.buckets.length > MAX_SERIES_POINTS) throw new SeriesBudgetError(series.buckets.length);
  return series;
}
