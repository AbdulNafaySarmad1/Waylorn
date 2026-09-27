import { describe, expect, it } from 'vitest';
import type { Prediction, ReliabilityMetric } from '@waylorn/contracts';
import { presentMetric, presentPrediction } from '../src/analytics';

const metric = (over: Partial<ReliabilityMetric>): ReliabilityMetric => ({
  key: 'mtbf',
  label: 'MTBF',
  unit: 'h',
  sampleSize: 12,
  dataCoverage: 0.95,
  method: { id: 'r.mtbf', version: '1.2.0', description: 'Exponential MLE' },
  ...over,
});

describe('presentMetric', () => {
  it('formats a value with its interval and qualifiers', () => {
    const p = presentMetric(metric({ value: 1234.5, interval: { lower: 900, upper: 1600, level: 0.95 } }));
    expect(p.valueText).toBe('1,234.5 h');
    expect(p.intervalText).toBe('95 % CI 900 h – 1,600 h');
    expect(p.qualifiers).toEqual(['n = 12', 'coverage 95 %']);
  });
  it('says insufficient data instead of inventing a value', () => {
    const p = presentMetric(metric({ dataCoverage: 0.4 }));
    expect(p.insufficient).toBe(true);
    expect(p.valueText).toBe('Insufficient data');
    expect(p.qualifiers).toContain('low data coverage');
  });
  it('renders ratios as percentages', () => {
    expect(presentMetric(metric({ key: 'availability', unit: 'ratio', value: 0.98765 })).valueText).toBe('98.77 %');
  });
});

describe('presentPrediction', () => {
  const prediction: Prediction = {
    id: 'p1',
    kind: 'failure_risk',
    label: 'Failure risk (90 days)',
    summary: '',
    estimate: { value: 0.18, unit: 'ratio', interval: { lower: 0.09, upper: 0.31, level: 0.9 } },
    confidence: 0.7,
    model: { name: 'frisk', version: '3.1.0' },
    inferredAt: '2026-09-27T10:00:00Z',
    dataFreshness: { latestInputAt: '2026-09-27T09:55:00Z', coverage: 0.9 },
    contributingSignals: [],
    status: 'current',
  };
  it('always phrases outputs as estimates', () => {
    const p = presentPrediction(prediction);
    expect(p.headline).toBe('Estimated failure risk (90 days): 18 %');
    expect(p.intervalText).toBe('90 % CI 9 % – 31 %');
    expect(p.confidenceText).toBe('Model-reported confidence 70 %');
  });
  it('flags stale predictions', () => {
    expect(presentPrediction({ ...prediction, status: 'stale' }).stale).toBe(true);
  });
});
