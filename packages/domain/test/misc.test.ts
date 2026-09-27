import { describe, expect, it } from 'vitest';
import { parseAssetQuery, serializeAssetQuery } from '../src/asset-query';
import { formatBytes, formatDuration, formatTimestamp } from '../src/format';
import { presentProblem } from '../src/problem';
import { assertSeriesWithinBudget, MAX_SERIES_POINTS, SeriesBudgetError } from '../src/telemetry';
import { contextPath, orgPath } from '../src/tenancy';
import { conflictingCategories } from '../src/ai';
import { target } from './fixtures';

describe('asset query', () => {
  it('drops unknown enum values and malformed ids', () => {
    expect(parseAssetQuery({ kind: 'Toaster', health: 'fault', site: '<script>', q: 'plc' })).toEqual({ health: 'fault', q: 'plc' });
  });
  it('round-trips', () => {
    const q = parseAssetQuery({ kind: 'IndustrialAsset', site: 'site_1', sort: 'health' });
    expect(serializeAssetQuery(q)).toBe('?site=site_1&kind=IndustrialAsset&sort=health');
  });
});

describe('format', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(4_000)).toBe('4 s');
    expect(formatDuration(3_900_000)).toBe('1 h 5 min');
    expect(formatDuration(190_000_000)).toBe('2 d 4 h');
  });
  it('formats bytes in binary units', () => {
    expect(formatBytes(1536)).toBe('1.5 KiB');
  });
  it('always states the time zone', () => {
    expect(formatTimestamp('2026-09-27T12:00:00Z', 'UTC')).toBe('2026-09-27 12:00:00 UTC');
    expect(formatTimestamp('2026-09-27T12:00:00Z', 'Europe/Berlin')).toMatch(/^2026-09-27 14:00:00 (GMT\+2|CEST)$/);
  });
});

describe('problems', () => {
  it('maps step-up to re-authentication', () => {
    expect(presentProblem({ title: 'x', status: 403, correlationId: 'c', type: 't', code: 'step_up_required' }).action).toBe('reauthenticate');
  });
  it('treats unparseable 5xx as degraded, not as permission', () => {
    expect(presentProblem('garbage', 503).title).toBe('Control plane unavailable');
  });
});

describe('telemetry budget', () => {
  it('rejects oversized series', () => {
    const buckets = Array.from({ length: MAX_SERIES_POINTS + 1 }, (_, i) => ({ t: new Date(i).toISOString(), count: 1 }));
    expect(() =>
      assertSeriesWithinBudget({ signal: 's', label: 's', resolutionSeconds: 1, buckets, gaps: [], provenance: { source: 'x' } }),
    ).toThrow(SeriesBudgetError);
  });
});

describe('tenancy', () => {
  it('builds unambiguous context paths', () => {
    expect(contextPath(target.context)).toBe('Acme Manufacturing › Munich Plant 3 (DE-MUC-P3)');
    expect(orgPath('acme', 'assets', 'a/b')).toBe('/o/acme/assets/a%2Fb');
  });
});

describe('ai policy', () => {
  it('detects categories both allowed and prohibited', () => {
    expect(conflictingCategories(['topology', 'recipes'], ['recipes'])).toEqual(['recipes']);
  });
});

describe('formatAge', () => {
  it('treats sub-tick skew as just now', async () => {
    const { formatAge } = await import('../src/format');
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(formatAge('2026-09-27T12:00:00.800Z', now)).toBe('just now');
    expect(formatAge('2026-09-27T11:59:50Z', now)).toBe('10 s ago');
  });
});
