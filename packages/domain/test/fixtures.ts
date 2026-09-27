import type { AssetSummary, PreflightResult } from '@waylorn/contracts';

export const target: AssetSummary = {
  id: 'ast_plc203',
  kind: 'IndustrialAsset',
  name: 'Press line 2 controller',
  tag: 'PLC-203',
  context: {
    organization: { id: 'org_1', slug: 'acme', name: 'Acme Manufacturing' },
    site: { id: 'site_1', code: 'DE-MUC-P3', name: 'Munich Plant 3', environment: 'production' },
  },
  lifecycle: 'in_service',
  health: { state: 'ok' },
  connectivity: { state: 'connected' },
  identityConfidence: 'confirmed',
};

export function preflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    preflightId: 'pf_1',
    expiresAt: '2026-09-27T12:05:00Z',
    safetyClass: 'AMBER',
    decision: 'permit',
    reasons: [],
    target,
    effect: { summary: 'Change configuration', parameters: [] },
    requestedBy: { subject: 'u1', displayName: 'A. Operator', type: 'human' },
    reason: 'Planned change',
    requirements: {
      stepUp: { required: false },
      changeTicket: false,
      secondApprover: false,
      typedConfirmation: false,
    },
    ...overrides,
  };
}
