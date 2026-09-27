import type { ActionDefinition, AssetDetail, PreflightResult } from '@waylorn/contracts';

export const asset: AssetDetail = {
  id: 'ast_plc203',
  kind: 'IndustrialAsset',
  name: 'Press Line 2 main controller',
  tag: 'PLC-203',
  manufacturer: 'Siemens',
  model: 'S7-1500',
  context: {
    organization: { id: 'org_1', slug: 'northwind', name: 'Northwind' },
    region: 'Europe',
    site: { id: 'site_1', code: 'DE-MUC-P3', name: 'Munich Plant 3', environment: 'production' },
    zone: { id: 'z', name: 'Press Hall' },
    line: { id: 'l', name: 'Press Line 2' },
  },
  lifecycle: 'in_service',
  health: { state: 'ok' },
  connectivity: { state: 'connected' },
  identityConfidence: 'confirmed',
  extension: { kind: 'IndustrialAsset', controlRole: 'plc', vendorSupport: 'supported' },
  capabilities: [],
  protocols: [],
  interfaces: [],
  vendorAttributes: [],
  externalReferences: [],
  permittedActions: [],
};

export function preflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    preflightId: 'pf_1',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    safetyClass: 'RED',
    decision: 'permit',
    reasons: [],
    policy: { id: 'pol_ot_change', name: 'OT physical-process write', version: '12', rule: 'red.write.requires_fresh_mfa' },
    target: asset,
    effect: { summary: 'Write ram pressure setpoint on PLC-203.', parameters: [{ label: 'Ram pressure setpoint', value: '160 bar', previousValue: '150 bar' }] },
    requestedBy: { subject: 'u1', displayName: 'K. Osei', type: 'human', identityProvider: { id: 'entra', displayName: 'Entra ID', protocol: 'oidc' } },
    reason: 'Adjust for die change CHG-7',
    changeTicket: 'CHG-7',
    requirements: { stepUp: { required: true, acr: 'urn:waylorn:acr:mfa', maxAgeSeconds: 300 }, changeTicket: true, secondApprover: true, typedConfirmation: true },
    ...overrides,
  };
}

export const actions: ActionDefinition[] = [
  {
    action: 'asset.read_configuration',
    label: 'Capture configuration snapshot',
    description: 'Reads configuration.',
    safetyClass: 'GREEN',
    parameters: [],
    availability: { action: 'asset.read_configuration', available: true },
  },
  {
    action: 'asset.write_setpoint',
    label: 'Write ram pressure setpoint',
    description: 'Affects the pressing process.',
    safetyClass: 'RED',
    parameters: [{ name: 'setpoint_bar', label: 'Ram pressure setpoint', type: 'number', unit: 'bar', min: 50, max: 180, required: true }],
    availability: { action: 'asset.write_setpoint', available: false, reason: 'Requires the controls-engineer role.' },
  },
];
