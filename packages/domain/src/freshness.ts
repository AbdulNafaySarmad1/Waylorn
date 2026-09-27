/**
 * Freshness classification for live values (ADR 0009). Operators must always be able
 * to tell whether a number is current; the classification is shown as text, not colour.
 */
export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unknown';

export interface FreshnessThresholds {
  /** Multiple of the expected interval after which a value is `delayed`. */
  readonly delayedFactor: number;
  /** Multiple of the expected interval after which a value is `stale`. */
  readonly staleFactor: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  delayedFactor: 2,
  staleFactor: 5,
};

export interface FreshnessInput {
  readonly observedAt: string | undefined;
  readonly expectedIntervalMs: number;
  /** False when the live stream is disconnected; values are then `unknown`. */
  readonly streamConnected: boolean;
}

export function classifyFreshness(
  input: FreshnessInput,
  nowMs: number,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
): Freshness {
  if (!input.streamConnected || input.observedAt === undefined) return 'unknown';
  const observedMs = Date.parse(input.observedAt);
  if (Number.isNaN(observedMs)) return 'unknown';
  if (!(input.expectedIntervalMs > 0)) return 'unknown';
  // Clock skew: a timestamp from the future is not trusted as fresh.
  const ageMs = nowMs - observedMs;
  if (ageMs < -input.expectedIntervalMs) return 'unknown';
  if (ageMs > input.expectedIntervalMs * thresholds.staleFactor) return 'stale';
  if (ageMs > input.expectedIntervalMs * thresholds.delayedFactor) return 'delayed';
  return 'fresh';
}

export const FRESHNESS_LABEL: Readonly<Record<Freshness, string>> = {
  fresh: 'Current',
  delayed: 'Delayed',
  stale: 'Stale',
  unknown: 'Unknown',
};

export const FRESHNESS_DESCRIPTION: Readonly<Record<Freshness, string>> = {
  fresh: 'Updated within the expected interval.',
  delayed: 'Update is overdue. Value may not reflect current state.',
  stale: 'No update for an extended period. Do not rely on this value.',
  unknown: 'No live connection or no observation. Last known value shown for reference only.',
};
