import type { LiveSignal } from '@waylorn/contracts';

export type LimitState = 'normal' | 'low_warning' | 'high_warning' | 'low_alarm' | 'high_alarm' | 'not_applicable';

/** Compares a live value with the limits the backend supplied. Alarm takes precedence. */
export function limitState(signal: Pick<LiveSignal, 'value' | 'limits'>): LimitState {
  const v = signal.value;
  const l = signal.limits;
  if (typeof v !== 'number' || !l) return 'not_applicable';
  if (l.highAlarm !== undefined && v >= l.highAlarm) return 'high_alarm';
  if (l.lowAlarm !== undefined && v <= l.lowAlarm) return 'low_alarm';
  if (l.highWarning !== undefined && v >= l.highWarning) return 'high_warning';
  if (l.lowWarning !== undefined && v <= l.lowWarning) return 'low_warning';
  return 'normal';
}

export const LIMIT_LABEL: Readonly<Record<LimitState, string>> = {
  normal: 'Within limits',
  low_warning: 'Below warning limit',
  high_warning: 'Above warning limit',
  low_alarm: 'Below alarm limit',
  high_alarm: 'Above alarm limit',
  not_applicable: '—',
};

/** Merges a streamed signal into the current set, ignoring out-of-order (older) updates. */
export function mergeSignal(current: ReadonlyMap<string, LiveSignal>, incoming: LiveSignal): Map<string, LiveSignal> {
  const next = new Map(current);
  const existing = current.get(incoming.key);
  if (existing && Date.parse(existing.observedAt) > Date.parse(incoming.observedAt)) return next;
  next.set(incoming.key, incoming);
  return next;
}
