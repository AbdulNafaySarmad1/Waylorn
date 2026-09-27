import type { ConnectivityState, Environment, HealthState, Severity } from '@waylorn/contracts';

/**
 * Status vocabularies. Each state has a text label and a distinct glyph so status is
 * never conveyed by colour alone (WCAG 1.4.1).
 */
export type StatusGlyph = 'check' | 'triangle' | 'cross' | 'question' | 'dot' | 'diamond' | 'slash';

export interface StatusPresentation {
  readonly label: string;
  readonly glyph: StatusGlyph;
  readonly tone: 'ok' | 'warning' | 'fault' | 'unknown' | 'info';
}

export const HEALTH: Readonly<Record<HealthState, StatusPresentation>> = {
  ok: { label: 'Normal', glyph: 'check', tone: 'ok' },
  warning: { label: 'Warning', glyph: 'triangle', tone: 'warning' },
  fault: { label: 'Fault', glyph: 'cross', tone: 'fault' },
  unknown: { label: 'Unknown', glyph: 'question', tone: 'unknown' },
};

export const SEVERITY: Readonly<Record<Severity, StatusPresentation>> = {
  info: { label: 'Info', glyph: 'dot', tone: 'info' },
  notice: { label: 'Notice', glyph: 'diamond', tone: 'info' },
  warning: { label: 'Warning', glyph: 'triangle', tone: 'warning' },
  critical: { label: 'Critical', glyph: 'cross', tone: 'fault' },
};

export const CONNECTIVITY: Readonly<Record<ConnectivityState, StatusPresentation>> = {
  connected: { label: 'Connected', glyph: 'check', tone: 'ok' },
  degraded: { label: 'Degraded', glyph: 'triangle', tone: 'warning' },
  disconnected: { label: 'Disconnected', glyph: 'slash', tone: 'fault' },
  unknown: { label: 'Unknown', glyph: 'question', tone: 'unknown' },
};

export const ENVIRONMENT: Readonly<Record<Environment, { readonly label: string; readonly consequential: boolean }>> = {
  production: { label: 'PRODUCTION', consequential: true },
  staging: { label: 'STAGING', consequential: false },
  lab: { label: 'LAB', consequential: false },
  development: { label: 'DEVELOPMENT', consequential: false },
};

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'warning', 'notice', 'info'];

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}
