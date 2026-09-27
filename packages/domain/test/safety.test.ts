import { describe, expect, it } from 'vitest';
import { confirmBlockers, effectiveSafetyClass, requiredCeremony, stepUpSatisfied } from '../src/safety';
import { preflight } from './fixtures';

const NOW = Date.parse('2026-09-27T12:00:00Z');

describe('effectiveSafetyClass', () => {
  it('treats a missing or unrecognised class as RED', () => {
    expect(effectiveSafetyClass(undefined)).toBe('RED');
    expect(effectiveSafetyClass(null)).toBe('RED');
    expect(effectiveSafetyClass('PURPLE' as never)).toBe('RED');
    expect(effectiveSafetyClass('GREEN')).toBe('GREEN');
  });
});

describe('requiredCeremony', () => {
  it('requires step-up and typed confirmation for RED even if policy omits them', () => {
    expect(requiredCeremony(preflight({ safetyClass: 'RED' }))).toEqual(['reason', 'step_up', 'typed_confirmation']);
  });
  it('follows policy requirements for AMBER', () => {
    const steps = requiredCeremony(
      preflight({
        requirements: {
          stepUp: { required: true },
          changeTicket: true,
          secondApprover: true,
          typedConfirmation: false,
        },
      }),
    );
    expect(steps).toEqual(['reason', 'change_ticket', 'step_up', 'second_approver']);
  });
});

describe('confirmBlockers', () => {
  const base = { nowMs: NOW, typedConfirmation: '', authTimeMs: NOW - 10_000, acr: undefined };

  it('has no blockers for a permitted, unexpired AMBER without extra ceremony', () => {
    expect(confirmBlockers(preflight(), base)).toEqual([]);
  });
  it('blocks a denied preflight', () => {
    expect(confirmBlockers(preflight({ decision: 'deny' }), base).map((b) => b.code)).toContain('denied');
  });
  it('blocks an expired preflight', () => {
    expect(
      confirmBlockers(preflight({ expiresAt: '2026-09-27T11:59:59Z' }), base).map((b) => b.code),
    ).toContain('expired');
  });
  it('requires the exact target tag for RED', () => {
    const red = preflight({ safetyClass: 'RED' });
    expect(confirmBlockers(red, { ...base, typedConfirmation: 'plc-203' }).map((b) => b.code)).toContain('typed_confirmation');
    expect(confirmBlockers(red, { ...base, typedConfirmation: 'PLC-203' }).map((b) => b.code)).not.toContain('typed_confirmation');
  });
  it('requires recent authentication for RED', () => {
    const red = preflight({ safetyClass: 'RED' });
    const stale = { ...base, typedConfirmation: 'PLC-203', authTimeMs: NOW - 301_000 };
    expect(confirmBlockers(red, stale).map((b) => b.code)).toEqual(['step_up']);
  });
});

describe('stepUpSatisfied', () => {
  it('checks acr when policy names one', () => {
    const p = preflight({
      requirements: {
        stepUp: { required: true, acr: 'urn:waylorn:acr:mfa', maxAgeSeconds: 60 },
        changeTicket: false,
        secondApprover: false,
        typedConfirmation: false,
      },
    });
    expect(stepUpSatisfied(p, { nowMs: NOW, typedConfirmation: '', authTimeMs: NOW - 1000, acr: 'urn:waylorn:acr:pwd' })).toBe(false);
    expect(stepUpSatisfied(p, { nowMs: NOW, typedConfirmation: '', authTimeMs: NOW - 1000, acr: 'urn:waylorn:acr:mfa' })).toBe(true);
    expect(stepUpSatisfied(p, { nowMs: NOW, typedConfirmation: '', authTimeMs: NOW - 61_000, acr: 'urn:waylorn:acr:mfa' })).toBe(false);
  });
  it('fails without an authentication time', () => {
    expect(stepUpSatisfied(preflight(), { nowMs: NOW, typedConfirmation: '', authTimeMs: undefined, acr: undefined })).toBe(false);
  });
});
