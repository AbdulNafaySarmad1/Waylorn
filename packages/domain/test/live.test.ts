import { describe, expect, it } from 'vitest';
import type { LiveSignal } from '@waylorn/contracts';
import { limitState, mergeSignal } from '../src/live';

const sig = (value: LiveSignal['value'], observedAt = '2026-09-27T12:00:00Z'): LiveSignal => ({
  key: 'oil_temp',
  label: 'Oil temperature',
  unit: '°C',
  value,
  quality: 'good',
  observedAt,
  expectedIntervalMs: 5000,
  source: 'test',
  limits: { highWarning: 60, highAlarm: 68, lowWarning: 10 },
});

describe('limitState', () => {
  it.each([
    [55, 'normal'],
    [60, 'high_warning'],
    [70, 'high_alarm'],
    [5, 'low_warning'],
  ] as const)('%s → %s', (v, expected) => {
    expect(limitState(sig(v))).toBe(expected);
  });
  it('does not evaluate non-numeric values', () => {
    expect(limitState(sig('RUN'))).toBe('not_applicable');
    expect(limitState(sig(null))).toBe('not_applicable');
  });
});

describe('mergeSignal', () => {
  it('ignores updates older than the current value', () => {
    const current = new Map([['oil_temp', sig(61, '2026-09-27T12:00:10Z')]]);
    const merged = mergeSignal(current, sig(50, '2026-09-27T12:00:05Z'));
    expect(merged.get('oil_temp')?.value).toBe(61);
  });
  it('accepts newer updates', () => {
    const current = new Map([['oil_temp', sig(61, '2026-09-27T12:00:10Z')]]);
    expect(mergeSignal(current, sig(62, '2026-09-27T12:00:15Z')).get('oil_temp')?.value).toBe(62);
  });
});
