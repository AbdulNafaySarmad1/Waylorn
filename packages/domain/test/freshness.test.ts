import { describe, expect, it } from 'vitest';
import { classifyFreshness } from '../src/freshness';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

describe('classifyFreshness', () => {
  it('is fresh within two intervals', () => {
    expect(classifyFreshness({ observedAt: at(1_500), expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('fresh');
  });
  it('is delayed beyond two intervals', () => {
    expect(classifyFreshness({ observedAt: at(2_500), expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('delayed');
  });
  it('is stale beyond five intervals', () => {
    expect(classifyFreshness({ observedAt: at(5_001), expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('stale');
  });
  it('is unknown when the stream is disconnected, even for a recent value', () => {
    expect(classifyFreshness({ observedAt: at(10), expectedIntervalMs: 1_000, streamConnected: false }, NOW)).toBe('unknown');
  });
  it('is unknown without an observation or with an invalid timestamp', () => {
    expect(classifyFreshness({ observedAt: undefined, expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('unknown');
    expect(classifyFreshness({ observedAt: 'not-a-date', expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('unknown');
  });
  it('does not trust timestamps from the future (clock skew)', () => {
    expect(classifyFreshness({ observedAt: at(-60_000), expectedIntervalMs: 1_000, streamConnected: true }, NOW)).toBe('unknown');
  });
  it('rejects a non-positive expected interval', () => {
    expect(classifyFreshness({ observedAt: at(0), expectedIntervalMs: 0, streamConnected: true }, NOW)).toBe('unknown');
  });
});

describe('freshness performance', () => {
  it('classifies 10k values well under a frame budget', () => {
    const inputs = Array.from({ length: 10_000 }, (_, i) => ({
      observedAt: at(i * 7),
      expectedIntervalMs: 1_000,
      streamConnected: true,
    }));
    const start = performance.now();
    for (const input of inputs) classifyFreshness(input, NOW);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
