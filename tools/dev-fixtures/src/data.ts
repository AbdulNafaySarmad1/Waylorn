/**
 * DEVELOPMENT FIXTURE DATA. Fictional organizations, sites and equipment used to exercise
 * the UI against the draft contract. Nothing here is measured from real equipment.
 * Deterministic: the same base time yields the same dataset.
 */
import type {
  AssetDetail,
  AssetSummary,
  AuditRecord,
  CustomDomain,
  AiDataPolicy,
  AiProvider,
  HostHealth,
  Incident,
  Site,
  TenancyContext,
  TopologyEdge,
  VendorAttribute,
  AssetKind,
  HealthState,
  RelationType,
} from '@waylorn/contracts';

export const BASE_TIME = Date.parse(process.env['FIXTURE_CLOCK'] ?? new Date().toISOString());
export const iso = (offsetMs: number): string => new Date(BASE_TIME + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Small deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FixtureOrg {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export const ORGS: readonly FixtureOrg[] = [
  { id: 'org_northwind', slug: 'northwind', name: 'Northwind Industrial (fixture)' },
  { id: 'org_harbor', slug: 'harbor', name: 'Harbor Foods (fixture)' },
];

interface FixtureSite extends Site {
  readonly orgId: string;
  readonly zones: readonly { id: string; name: string; lines: readonly { id: string; name: string }[] }[];
}

export const SITES: readonly FixtureSite[] = [
  {
    orgId: 'org_northwind',
    id: 'site_muc3',
    code: 'DE-MUC-P3',
    name: 'Munich Plant 3',
    regionName: 'Europe',
    environment: 'production',
    timezone: 'Europe/Berlin',
    connectivity: { state: 'connected', lastContactAt: iso(-4_000) },
    zones: [
      { id: 'zone_press', name: 'Press Hall', lines: [{ id: 'line_press2', name: 'Press Line 2' }, { id: 'line_press1', name: 'Press Line 1' }] },
      { id: 'zone_paint', name: 'Paint Shop', lines: [{ id: 'line_paint', name: 'Paint Line A' }] },
      { id: 'zone_util', name: 'Utilities & Server Room', lines: [] },
    ],
  },
  {
    orgId: 'org_northwind',
    id: 'site_cle',
    code: 'US-OH-CLE',
    name: 'Cleveland Stamping',
    regionName: 'North America',
    environment: 'production',
    timezone: 'America/New_York',
    connectivity: { state: 'degraded', lastContactAt: iso(-45_000) },
    zones: [{ id: 'zone_cle_stamp', name: 'Stamping', lines: [{ id: 'line_cle_s1', name: 'Stamping Line 1' }] }],
  },
  {
    orgId: 'org_northwind',
    id: 'site_qro',
    code: 'MX-QRO-P1',
    name: 'Querétaro Plant 1',
    regionName: 'North America',
    environment: 'production',
    timezone: 'America/Mexico_City',
    connectivity: { state: 'disconnected', lastContactAt: iso(-42 * MIN) },
    zones: [{ id: 'zone_qro_asm', name: 'Assembly', lines: [{ id: 'line_qro_a1', name: 'Assembly Line 1' }] }],
  },
  {
    orgId: 'org_northwind',
    id: 'site_wro_lab',
    code: 'PL-WRO-LAB',
    name: 'Wrocław Integration Lab',
    regionName: 'Europe',
    environment: 'lab',
    timezone: 'Europe/Warsaw',
    connectivity: { state: 'connected', lastContactAt: iso(-2_000) },
    zones: [{ id: 'zone_lab', name: 'Test Bench', lines: [{ id: 'line_lab', name: 'Bench 1' }] }],
  },
  {
    orgId: 'org_harbor',
    id: 'site_hbr_ams',
    code: 'NL-AMS-B1',
    name: 'Amsterdam Bakery 1',
    regionName: 'Europe',
    environment: 'production',
    timezone: 'Europe/Amsterdam',
    connectivity: { state: 'connected', lastContactAt: iso(-3_000) },
    zones: [{ id: 'zone_hbr_ovens', name: 'Ovens', lines: [{ id: 'line_hbr_o1', name: 'Oven Line 1' }] }],
  },
];

export function orgById(id: string): FixtureOrg | undefined {
  return ORGS.find((o) => o.id === id);
}

export function siteById(id: string): FixtureSite | undefined {
  return SITES.find((s) => s.id === id);
}

function contextFor(siteId: string, zoneId?: string, lineId?: string): TenancyContext {
  const site = siteById(siteId);
  if (!site) throw new Error(`fixture: unknown site ${siteId}`);
  const org = orgById(site.orgId);
  if (!org) throw new Error(`fixture: unknown org ${site.orgId}`);
  const zone = site.zones.find((z) => z.id === zoneId);
  const line = zone?.lines.find((l) => l.id === lineId);
  return {
    organization: { id: org.id, slug: org.slug, name: org.name },
    region: site.regionName,
    site: { id: site.id, code: site.code, name: site.name, environment: site.environment },
    ...(zone ? { zone: { id: zone.id, name: zone.name } } : {}),
    ...(line ? { line: { id: line.id, name: line.name } } : {}),
  };
}

export interface FixtureAsset {
  readonly orgId: string;
  readonly role: string;
  readonly detail: AssetDetail & { extension: NonNullable<AssetDetail['extension']> };
}

const cap = (
  operation: string,
  label: string,
  safetyClass: 'GREEN' | 'AMBER' | 'RED',
  s: [observed: boolean, declared: boolean, siteApproved: boolean, authorized: boolean],
) => ({ operation, label, safetyClass, observed: s[0], declared: s[1], siteApproved: s[2], currentlyAuthorized: s[3] });

const GREEN_CAPS = [
  cap('identify', 'Identify', 'GREEN', [true, true, true, true]),
  cap('read', 'Read values', 'GREEN', [true, true, true, true]),
  cap('read_configuration', 'Read configuration', 'GREEN', [true, true, true, true]),
];

function vendor(namespace: string, entries: readonly [string, string, string, string?][]): VendorAttribute[] {
  return entries.map(([key, label, value, unit]) => ({ namespace, key, label, value, ...(unit ? { unit } : {}) }));
}

const ops = (team: string, contact: string) => ({ team, contact });

interface AssetSeed {
  id: string;
  kind: AssetKind;
  role: string;
  tag: string;
  name: string;
  site: string;
  zone?: string;
  line?: string;
  manufacturer?: string;
  model?: string;
  installedYear?: number;
  health?: HealthState;
  healthReason?: string;
  extension: NonNullable<AssetDetail['extension']>;
  firmware?: string;
  serial?: string;
  confidence?: AssetSummary['identityConfidence'];
  connectivity?: AssetSummary['connectivity'];
  lifecycle?: AssetSummary['lifecycle'];
  capabilities?: AssetDetail['capabilities'];
  protocols?: AssetDetail['protocols'];
  interfaces?: AssetDetail['interfaces'];
  vendorAttributes?: VendorAttribute[];
  externalReferences?: AssetDetail['externalReferences'];
}

function build(seed: AssetSeed): FixtureAsset {
  const context = contextFor(seed.site, seed.zone, seed.line);
  const site = siteById(seed.site);
  const siteConnected = site?.connectivity.state === 'connected';
  const detail: FixtureAsset['detail'] = {
    id: seed.id,
    kind: seed.kind,
    name: seed.name,
    tag: seed.tag,
    ...(seed.manufacturer ? { manufacturer: seed.manufacturer } : {}),
    ...(seed.model ? { model: seed.model } : {}),
    ...(seed.installedYear ? { installedYear: seed.installedYear } : {}),
    context,
    lifecycle: seed.lifecycle ?? 'in_service',
    // A disconnected site cannot report current health; the last known state is only a reason.
    health: {
      state: site?.connectivity.state === 'disconnected' ? 'unknown' : (seed.health ?? 'ok'),
      ...(site?.connectivity.state === 'disconnected'
        ? { reason: `Site disconnected; last known state: ${seed.health ?? 'ok'}` }
        : seed.healthReason
          ? { reason: seed.healthReason }
          : {}),
      observedAt: iso(siteConnected ? -5_000 : -42 * MIN),
    },
    connectivity: seed.connectivity ?? {
      state: site?.connectivity.state ?? 'unknown',
      lastSeenAt: site?.connectivity.lastContactAt ?? iso(-DAY),
    },
    identityConfidence: seed.confidence ?? 'confirmed',
    ...(seed.serial ? { serialNumber: { value: seed.serial, provenance: { source: 'site-agent/identify', observedAt: iso(-3 * DAY) } } } : {}),
    ...(seed.firmware ? { firmware: { value: seed.firmware, provenance: { source: 'site-agent/identify', observedAt: iso(-3 * DAY) } } } : {}),
    extension: seed.extension,
    capabilities: seed.capabilities ?? GREEN_CAPS,
    protocols: seed.protocols ?? [],
    interfaces: seed.interfaces ?? [],
    vendorAttributes: seed.vendorAttributes ?? [],
    externalReferences: seed.externalReferences ?? [],
    businessOwner: ops('Press Hall Operations', 'press-ops@northwind.example'),
    maintenanceOwner: ops('Maintenance — Electrical', 'maint-e@northwind.example'),
    permittedActions: [],
  };
  return { orgId: context.organization.id, role: seed.role, detail };
}

const NAMED: AssetSeed[] = [
  {
    id: 'ast_plc203',
    kind: 'IndustrialAsset',
    role: 'plc',
    tag: 'PLC-203',
    name: 'Press Line 2 main controller',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Siemens',
    model: 'SIMATIC S7-1500 CPU 1516-3 PN/DP',
    installedYear: 2019,
    firmware: 'V3.1.2',
    serial: 'S C-J4U812345678',
    extension: { kind: 'IndustrialAsset', controlRole: 'plc', vendorSupport: 'supported', programmingEnvironment: 'TIA Portal V19', protocolsSummary: 'OPC UA, S7comm+, PROFINET' },
    capabilities: [
      ...GREEN_CAPS,
      cap('subscribe', 'Subscribe to values', 'GREEN', [true, true, true, true]),
      cap('change_configuration', 'Change configuration', 'AMBER', [true, true, true, false]),
      cap('write', 'Write process values', 'RED', [true, true, false, false]),
    ],
    protocols: [
      { protocol: 'OPC UA', version: '1.04', role: 'server', interfaceId: 'if_x1', source: 'observed' },
      { protocol: 'S7comm+', role: 'server', interfaceId: 'if_x1', source: 'observed' },
      { protocol: 'PROFINET IO', role: 'server', interfaceId: 'if_x2', source: 'declared' },
    ],
    interfaces: [
      { id: 'if_x1', medium: 'ethernet', label: 'X1 P1', networkZone: 'Cell 2 (SL2)', addressRef: 'addr:tok_7f3a', gatewayPath: ['SW-P3-CORE'] },
      { id: 'if_x2', medium: 'fieldbus', label: 'X2 PROFINET', networkZone: 'Cell 2 (SL2)' },
    ],
    vendorAttributes: vendor('siemens.s7', [
      ['order_number', 'Article number', '6ES7516-3AN02-0AB0'],
      ['cycle_time', 'Configured max. cycle time', '150', 'ms'],
      ['protection_level', 'Access protection level', 'Full access (no protection)'],
      ['opcua_security', 'OPC UA security policy', 'Basic256Sha256 — Sign & Encrypt'],
    ]),
    externalReferences: [
      { system: 'SAP PM', externalId: '10004711', syncedAt: iso(-6 * HOUR) },
      { system: 'ServiceNow CMDB', externalId: 'CI0098812', syncedAt: iso(-DAY) },
    ],
  },
  {
    id: 'ast_hmi203',
    kind: 'IndustrialAsset',
    role: 'hmi',
    tag: 'HMI-203',
    name: 'Press Line 2 operator panel',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Siemens',
    model: 'SIMATIC HMI TP1500 Comfort',
    installedYear: 2019,
    firmware: 'V17.0.0.3',
    extension: { kind: 'IndustrialAsset', controlRole: 'hmi', vendorSupport: 'supported' },
    protocols: [{ protocol: 'S7comm', role: 'client', source: 'observed' }],
  },
  {
    id: 'ast_press1991',
    kind: 'IndustrialAsset',
    role: 'machine',
    tag: 'MCH-P2-07',
    name: 'Hydraulic transfer press (1991)',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Schuler',
    model: 'Hydraulic transfer press, 800 t',
    installedYear: 1991,
    health: 'warning',
    healthReason: 'Hydraulic oil temperature above warning limit',
    confidence: 'probable',
    serial: 'unknown — nameplate illegible',
    extension: { kind: 'IndustrialAsset', controlRole: 'machine', vendorSupport: 'end_of_life', protocolsSummary: 'Proprietary serial (RS-232) via serial server' },
    capabilities: [
      cap('identify', 'Identify', 'GREEN', [false, true, true, true]),
      cap('read', 'Read values', 'GREEN', [true, true, true, true]),
      cap('read_configuration', 'Read configuration', 'GREEN', [false, false, false, false]),
    ],
    protocols: [{ protocol: 'Proprietary serial (vendor line protocol)', role: 'passive', interfaceId: 'if_ser', source: 'declared' }],
    interfaces: [{ id: 'if_ser', medium: 'serial_rs232', label: 'Diagnostic port (DB-25)', gatewayPath: ['GW-P3-01 (Moxa NPort 5150)', 'SW-P3-CORE', 'EDGE-P3-01 site agent'] }],
    connectivity: { state: 'connected', lastSeenAt: iso(-8_000), path: 'RS-232 → Moxa NPort 5150 → site agent (polling 5 s)' },
    vendorAttributes: vendor('legacy.serial', [
      ['baud', 'Serial settings', '9600 8N1'],
      ['register_map', 'Register map source', 'Scanned 1991 service manual, rev. C'],
      ['controller', 'Original controller', 'Relay logic + retrofit counter module (1998)'],
    ]),
  },
  {
    id: 'ast_gw01',
    kind: 'NetworkAsset',
    role: 'serial_server',
    tag: 'GW-P3-01',
    name: 'Serial device server for press 07',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Moxa',
    model: 'NPort 5150',
    installedYear: 2016,
    firmware: 'v3.9',
    extension: { kind: 'NetworkAsset', role: 'serial_server', portCount: 1, managed: true },
  },
  {
    id: 'ast_drv203',
    kind: 'IndustrialAsset',
    role: 'drive',
    tag: 'DRV-203-1',
    name: 'Main ram drive',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Siemens',
    model: 'SINAMICS S120',
    installedYear: 2019,
    extension: { kind: 'IndustrialAsset', controlRole: 'drive', vendorSupport: 'supported' },
  },
  {
    id: 'ast_pt2031',
    kind: 'IndustrialAsset',
    role: 'sensor',
    tag: 'PT-2031',
    name: 'Hydraulic pressure transmitter',
    site: 'site_muc3',
    zone: 'zone_press',
    line: 'line_press2',
    manufacturer: 'Endress+Hauser',
    model: 'Cerabar PMC71',
    installedYear: 2012,
    extension: { kind: 'IndustrialAsset', controlRole: 'sensor', vendorSupport: 'limited' },
  },
  {
    id: 'ast_sw_core',
    kind: 'NetworkAsset',
    role: 'switch',
    tag: 'SW-P3-CORE',
    name: 'Press hall industrial switch',
    site: 'site_muc3',
    zone: 'zone_press',
    manufacturer: 'Cisco',
    model: 'Catalyst IE3400',
    installedYear: 2021,
    extension: { kind: 'NetworkAsset', role: 'switch', portCount: 10, managed: true },
  },
  {
    id: 'ast_fw_dmz',
    kind: 'SecurityAsset',
    role: 'firewall',
    tag: 'FW-P3-DMZ',
    name: 'Industrial DMZ firewall',
    site: 'site_muc3',
    zone: 'zone_util',
    manufacturer: 'Fortinet',
    model: 'FortiGate 100F',
    installedYear: 2022,
    extension: { kind: 'SecurityAsset', function: 'firewall' },
  },
  {
    id: 'ast_edge01',
    kind: 'ComputeAsset',
    role: 'edge_server',
    tag: 'EDGE-P3-01',
    name: 'Press hall edge server',
    site: 'site_muc3',
    zone: 'zone_util',
    manufacturer: 'Dell',
    model: 'PowerEdge XR11',
    installedYear: 2023,
    extension: { kind: 'ComputeAsset', platform: 'podman_host', provider: 'on_premises', operatingSystem: 'RHEL 9.6 (SELinux enforcing)', cpuCores: 16, memoryBytes: 68_719_476_736 },
  },
  {
    id: 'ast_hist',
    kind: 'ApplicationAsset',
    role: 'historian',
    tag: 'APP-HIST-P3',
    name: 'Site telemetry store',
    site: 'site_muc3',
    zone: 'zone_util',
    extension: { kind: 'ApplicationAsset', runtime: 'podman', version: '0.1.0-dev' },
  },
  {
    id: 'ast_k8s01',
    kind: 'ComputeAsset',
    role: 'edge_server',
    tag: 'K8S-P3-N1',
    name: 'Site cluster node 1',
    site: 'site_muc3',
    zone: 'zone_util',
    manufacturer: 'Hetzner',
    model: 'AX52 (dedicated)',
    installedYear: 2024,
    extension: { kind: 'ComputeAsset', platform: 'kubernetes_node', provider: 'hetzner', operatingSystem: 'RHEL 9.6', cpuCores: 16, memoryBytes: 137_438_953_472 },
  },
  {
    id: 'ast_nas',
    kind: 'StorageAsset',
    role: 'storage',
    tag: 'STO-P3-S3',
    name: 'Site object store (S3-compatible)',
    site: 'site_muc3',
    zone: 'zone_util',
    extension: { kind: 'StorageAsset', storageType: 'object', capacityBytes: 64 * 1024 ** 4, usedBytes: 41 * 1024 ** 4, worm: true },
  },
  {
    id: 'ast_cloud_hub',
    kind: 'CloudResource',
    role: 'cloud_service',
    tag: 'CLD-AZ-IOTHUB',
    name: 'Enterprise analytics ingestion',
    site: 'site_muc3',
    extension: { kind: 'CloudResource', provider: 'azure', account: 'nw-analytics-prod', region: 'westeurope', resourceType: 'Microsoft.Devices/IotHubs' },
  },
  {
    id: 'ast_plc117',
    kind: 'IndustrialAsset',
    role: 'plc',
    tag: 'PLC-117',
    name: 'Paint booth controller',
    site: 'site_muc3',
    zone: 'zone_paint',
    line: 'line_paint',
    manufacturer: 'Rockwell Automation',
    model: 'ControlLogix 1756-L73',
    installedYear: 2011,
    firmware: '20.054',
    health: 'fault',
    healthReason: 'Major recoverable fault (Type 4, Code 20)',
    extension: { kind: 'IndustrialAsset', controlRole: 'plc', vendorSupport: 'limited', programmingEnvironment: 'Studio 5000 v20' },
    protocols: [{ protocol: 'EtherNet/IP (CIP)', role: 'server', source: 'observed' }],
    vendorAttributes: vendor('rockwell.logix', [
      ['keyswitch', 'Key switch position', 'REMOTE RUN'],
      ['catalog', 'Catalog number', '1756-L73/B'],
    ]),
  },
  {
    id: 'ast_plc_cle01',
    kind: 'IndustrialAsset',
    role: 'plc',
    tag: 'PLC-C101',
    name: 'Stamping line 1 controller',
    site: 'site_cle',
    zone: 'zone_cle_stamp',
    line: 'line_cle_s1',
    manufacturer: 'Mitsubishi Electric',
    model: 'MELSEC iQ-R R04CPU',
    installedYear: 2018,
    extension: { kind: 'IndustrialAsset', controlRole: 'plc', vendorSupport: 'supported' },
  },
  {
    id: 'ast_plc_hbr01',
    kind: 'IndustrialAsset',
    role: 'plc',
    tag: 'PLC-OV1',
    name: 'Oven line 1 controller',
    site: 'site_hbr_ams',
    zone: 'zone_hbr_ovens',
    line: 'line_hbr_o1',
    manufacturer: 'Schneider Electric',
    model: 'Modicon M580',
    installedYear: 2020,
    extension: { kind: 'IndustrialAsset', controlRole: 'plc', vendorSupport: 'supported' },
  },
];

const MANUFACTURERS: readonly (readonly [string, string, string, number])[] = [
  ['Siemens', 'SIMATIC S7-300 CPU 315-2 DP', 'plc', 2004],
  ['Siemens', 'SIMATIC S7-1200 CPU 1214C', 'plc', 2015],
  ['Rockwell Automation', 'CompactLogix 5380', 'plc', 2020],
  ['Omron', 'NX1P2', 'plc', 2019],
  ['Beckhoff', 'CX5140', 'plc', 2021],
  ['Endress+Hauser', 'Promag 10', 'sensor', 2014],
  ['ifm', 'PN7094', 'sensor', 2017],
  ['Vega', 'VEGAPULS 64', 'sensor', 2022],
  ['SEW-Eurodrive', 'MOVIDRIVE B', 'drive', 2010],
  ['ABB', 'ACS880', 'drive', 2019],
  ['Weintek', 'cMT3162X', 'hmi', 2021],
];

/** Bulk assets to exercise pagination, virtualization and clustering. */
function bulk(): AssetSeed[] {
  const rand = prng(20260927);
  const out: AssetSeed[] = [];
  const lines = SITES.filter((s) => s.orgId === 'org_northwind').flatMap((s) =>
    s.zones.flatMap((z) => z.lines.map((l) => ({ site: s.id, zone: z.id, line: l.id, code: s.code }))),
  );
  let n = 0;
  for (const line of lines) {
    const count = line.line === 'line_press2' ? 60 : 380;
    for (let i = 0; i < count; i += 1) {
      const m = MANUFACTURERS[Math.floor(rand() * MANUFACTURERS.length)] ?? MANUFACTURERS[0]!;
      const [manufacturer, model, role, year] = m;
      const r = rand();
      const health: HealthState = r < 0.02 ? 'fault' : r < 0.08 ? 'warning' : 'ok';
      n += 1;
      const prefix = role === 'plc' ? 'PLC' : role === 'sensor' ? 'TT' : role === 'drive' ? 'DRV' : 'HMI';
      const tag = `${prefix}-${line.code.split('-').at(-1) ?? 'X'}-${String(n).padStart(4, '0')}`;
      out.push({
        id: `ast_b${String(n).padStart(5, '0')}`,
        kind: 'IndustrialAsset',
        role,
        tag,
        name: `${manufacturer} ${role === 'sensor' ? 'transmitter' : role} ${n}`,
        site: line.site,
        zone: line.zone,
        line: line.line,
        manufacturer,
        model,
        installedYear: year - Math.floor(rand() * 4),
        health,
        extension: {
          kind: 'IndustrialAsset',
          controlRole: role === 'plc' ? 'plc' : role === 'sensor' ? 'sensor' : role === 'drive' ? 'drive' : 'hmi',
          vendorSupport: year < 2010 ? 'end_of_life' : 'supported',
        },
      });
    }
  }
  return out;
}

export const ASSETS: readonly FixtureAsset[] = [...NAMED, ...bulk()].map(build);
const ASSET_INDEX = new Map(ASSETS.map((a) => [a.detail.id, a]));

export function assetById(orgId: string, id: string): FixtureAsset | undefined {
  const a = ASSET_INDEX.get(id);
  // Tenant boundary: an asset outside the requested org does not exist for that caller.
  return a?.orgId === orgId ? a : undefined;
}

const e = (source: string, target: string, relation: RelationType, provenance: TopologyEdge['provenance'] = 'reviewed'): TopologyEdge => ({
  id: `${source}__${relation}__${target}`,
  source,
  target,
  relation,
  provenance,
});

function buildEdges(): TopologyEdge[] {
  const edges: TopologyEdge[] = [
    e('ast_plc203', 'ast_drv203', 'CONTROLS'),
    e('ast_plc203', 'ast_press1991', 'MONITORED_BY', 'declared'),
    e('ast_press1991', 'ast_gw01', 'CONNECTED_TO', 'discovered'),
    e('ast_pt2031', 'ast_plc203', 'SENDS_DATA_TO'),
    e('ast_hmi203', 'ast_plc203', 'REPRESENTED_BY'),
    e('ast_plc203', 'ast_sw_core', 'CONNECTED_TO', 'discovered'),
    e('ast_hmi203', 'ast_sw_core', 'CONNECTED_TO', 'discovered'),
    e('ast_gw01', 'ast_sw_core', 'CONNECTED_TO', 'discovered'),
    e('ast_sw_core', 'ast_edge01', 'CONNECTED_TO', 'discovered'),
    e('ast_edge01', 'ast_fw_dmz', 'PROTECTED_BY'),
    e('ast_hist', 'ast_edge01', 'HOSTED_ON'),
    e('ast_hist', 'ast_nas', 'DEPENDS_ON'),
    e('ast_plc203', 'ast_hist', 'SENDS_DATA_TO'),
    e('ast_press1991', 'ast_hist', 'SENDS_DATA_TO'),
    e('ast_hist', 'ast_cloud_hub', 'SENDS_DATA_TO', 'declared'),
    e('ast_plc117', 'ast_sw_core', 'CONNECTED_TO', 'discovered'),
    e('ast_plc117', 'ast_hist', 'SENDS_DATA_TO'),
    e('ast_k8s01', 'ast_fw_dmz', 'PROTECTED_BY'),
    e('ast_hist', 'ast_k8s01', 'DEPENDS_ON', 'declared'),
    e('ast_drv203', 'ast_press1991', 'CONTROLS', 'declared'),
  ];
  // Bulk assets: each line's devices connect to one bulk PLC, which sends to the historian.
  const byLine = new Map<string, FixtureAsset[]>();
  for (const a of ASSETS) {
    if (!a.detail.id.startsWith('ast_b')) continue;
    const key = a.detail.context.line?.id ?? '';
    const list = byLine.get(key) ?? [];
    list.push(a);
    byLine.set(key, list);
  }
  for (const [lineId, list] of byLine) {
    const plc = list.find((a) => a.role === 'plc');
    if (!plc) continue;
    if (lineId === 'line_press2') edges.push(e(plc.detail.id, 'ast_plc203', 'CONNECTED_TO', 'discovered'));
    else if (plc.orgId === 'org_northwind' && plc.detail.context.site.id === 'site_muc3') edges.push(e(plc.detail.id, 'ast_hist', 'SENDS_DATA_TO', 'declared'));
    for (const a of list) {
      if (a === plc) continue;
      edges.push(e(a.detail.id, plc.detail.id, a.role === 'sensor' ? 'SENDS_DATA_TO' : a.role === 'hmi' ? 'REPRESENTED_BY' : 'CONNECTED_TO', 'discovered'));
    }
  }
  return edges;
}

export const EDGES: readonly TopologyEdge[] = buildEdges();

export const INCIDENTS: readonly Incident[] = [
  {
    id: 'inc_1042',
    title: 'Paint booth controller major fault — line stopped',
    severity: 'critical',
    status: 'acknowledged',
    openedAt: iso(-37 * MIN),
    updatedAt: iso(-6 * MIN),
    context: contextFor('site_muc3', 'zone_paint', 'line_paint'),
    assetCount: 3,
    primaryAsset: ASSET_INDEX.get('ast_plc117')!.detail,
    owner: 'Shift lead — M. Hoffmann',
  },
  {
    id: 'inc_1041',
    title: 'Querétaro site gateway unreachable',
    severity: 'warning',
    status: 'open',
    openedAt: iso(-41 * MIN),
    context: contextFor('site_qro'),
    assetCount: 380,
  },
  {
    id: 'inc_1039',
    title: 'Hydraulic oil temperature trending high on MCH-P2-07',
    severity: 'warning',
    status: 'open',
    openedAt: iso(-3 * HOUR),
    context: contextFor('site_muc3', 'zone_press', 'line_press2'),
    assetCount: 1,
    primaryAsset: ASSET_INDEX.get('ast_press1991')!.detail,
  },
  {
    id: 'inc_1030',
    title: 'Certificate for Cleveland site gateway expires in 9 days',
    severity: 'notice',
    status: 'open',
    openedAt: iso(-2 * DAY),
    context: contextFor('site_cle'),
    assetCount: 1,
  },
  {
    id: 'inc_1011',
    title: 'Packet loss on press hall switch uplink',
    severity: 'warning',
    status: 'resolved',
    openedAt: iso(-9 * DAY),
    updatedAt: iso(-8 * DAY),
    context: contextFor('site_muc3', 'zone_press'),
    assetCount: 1,
  },
];

export function hosts(): HostHealth[] {
  const m = (value: number, ago = 15_000) => ({ value, observedAt: iso(-ago) });
  const asset = (id: string) => ASSET_INDEX.get(id)!.detail;
  return [
    {
      asset: asset('ast_edge01'),
      platform: 'podman_host',
      provider: 'on_premises',
      expectedIntervalMs: 15_000,
      cpuUtilization: m(0.41),
      memoryUtilization: m(0.63),
      diskUtilization: m(0.71),
      diskIoUtilization: m(0.12),
      networkPacketLoss: m(0.0),
      networkLatencyMs: m(0.8),
      temperatureC: m(47),
      uptimeSeconds: m(38 * 86_400),
      containers: { running: 11, total: 11, observedAt: iso(-15_000) },
      certificateExpiry: { subject: 'CN=edge-p3-01.muc3.northwind.example', notAfter: iso(62 * DAY) },
      services: [
        { name: 'NATS JetStream', state: 'ok', observedAt: iso(-15_000) },
        { name: 'Valkey', state: 'ok', observedAt: iso(-15_000) },
        { name: 'PostgreSQL', state: 'ok', observedAt: iso(-15_000) },
      ],
    },
    {
      asset: asset('ast_k8s01'),
      platform: 'kubernetes_node',
      provider: 'hetzner',
      expectedIntervalMs: 15_000,
      cpuUtilization: m(0.78),
      memoryUtilization: m(0.88),
      diskUtilization: m(0.93),
      diskIoUtilization: m(0.54),
      networkPacketLoss: m(0.004),
      networkLatencyMs: m(18.2),
      uptimeSeconds: m(3 * 86_400),
      containers: { running: 42, total: 44, observedAt: iso(-15_000) },
      certificateExpiry: { subject: 'CN=k8s-p3-n1', notAfter: iso(9 * DAY) },
      services: [
        { name: 'kubelet', state: 'ok', observedAt: iso(-15_000) },
        { name: 'Redpanda', state: 'warning', observedAt: iso(-15_000) },
      ],
    },
    {
      asset: { ...asset('ast_plc_cle01'), id: 'ast_cle_srv', tag: 'SRV-CLE-01', name: 'Cleveland edge server', kind: 'ComputeAsset' },
      platform: 'bare_metal',
      provider: 'customer_datacenter',
      expectedIntervalMs: 15_000,
      // Degraded site link: metrics are old.
      cpuUtilization: m(0.22, 4 * MIN),
      memoryUtilization: m(0.51, 4 * MIN),
      uptimeSeconds: m(201 * 86_400, 4 * MIN),
      services: [{ name: 'NATS JetStream', state: 'unknown' }],
    },
  ];
}

export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: 'aip_ollama',
    displayName: 'Plant-local assistant',
    providerClass: 'ollama',
    endpoint: 'http://ollama.muc3.internal:11434',
    model: 'qwen3:32b',
    locality: 'on_premises',
    classificationCeiling: 'confidential',
    status: 'enabled',
    lastHealthCheck: { at: iso(-2 * MIN), state: 'ok' },
  },
  {
    id: 'aip_vllm',
    displayName: 'Datacenter inference cluster',
    providerClass: 'vllm',
    endpoint: 'https://vllm.dc1.northwind.example/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    locality: 'on_premises',
    classificationCeiling: 'confidential',
    status: 'enabled',
    lastHealthCheck: { at: iso(-2 * MIN), state: 'ok' },
  },
  {
    id: 'aip_azure',
    displayName: 'Azure OpenAI (customer tenancy)',
    providerClass: 'azure_openai',
    endpoint: 'https://nw-openai-weu.openai.azure.com',
    model: 'gpt-4.1 (deployment nw-general)',
    locality: 'customer_cloud',
    classificationCeiling: 'internal',
    status: 'enabled',
    lastHealthCheck: { at: iso(-2 * MIN), state: 'ok' },
  },
  {
    id: 'aip_anthropic',
    displayName: 'Anthropic API',
    providerClass: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    model: 'claude-sonnet-5',
    locality: 'external',
    classificationCeiling: 'internal',
    status: 'pending_approval',
  },
];

const ADMIN_ACTOR = { subject: 'u_admin', displayName: 'R. Novak (fixture)', type: 'human' as const };

export const AI_POLICIES: AiDataPolicy[] = [
  {
    id: 'aipol_ollama',
    providerId: 'aip_ollama',
    version: '7',
    classification: 'confidential',
    allowedCategories: ['asset_inventory', 'topology', 'telemetry_aggregates', 'maintenance_records', 'reliability_metrics', 'security_events'],
    prohibitedCategories: ['recipes', 'personal_data'],
    redaction: { enabled: true, fields: ['network.address', 'credentials.*'] },
    pseudonymization: { enabled: false, scopes: [] },
    aggregation: { enabled: false },
    approval: { required: false },
    retention: { localTranscriptDays: 30 },
    updatedAt: iso(-12 * DAY),
    updatedBy: ADMIN_ACTOR,
  },
  {
    id: 'aipol_azure',
    providerId: 'aip_azure',
    version: '3',
    classification: 'internal',
    allowedCategories: ['asset_inventory', 'telemetry_aggregates', 'reliability_metrics'],
    prohibitedCategories: ['raw_telemetry', 'plc_configuration', 'recipes', 'network_details', 'personal_data', 'security_events', 'topology'],
    redaction: { enabled: true, fields: ['asset.serialNumber', 'network.address', 'person.*'] },
    pseudonymization: { enabled: true, scopes: ['people', 'sites', 'network_addresses'] },
    aggregation: { enabled: true, minimumGroupSize: 5 },
    approval: { required: false },
    retention: { localTranscriptDays: 30, providerRetention: 'Abuse monitoring opt-out approved; no provider retention (contract NW-2025-114)' },
    updatedAt: iso(-40 * DAY),
    updatedBy: ADMIN_ACTOR,
  },
  {
    id: 'aipol_anthropic',
    providerId: 'aip_anthropic',
    version: '1',
    classification: 'internal',
    allowedCategories: ['asset_inventory', 'reliability_metrics'],
    prohibitedCategories: ['raw_telemetry', 'plc_configuration', 'recipes', 'network_details', 'personal_data', 'security_events', 'topology', 'audit_records'],
    redaction: { enabled: true, fields: ['asset.serialNumber', 'network.address', 'person.*'] },
    pseudonymization: { enabled: true, scopes: ['people', 'sites', 'assets', 'network_addresses'] },
    aggregation: { enabled: true, minimumGroupSize: 10 },
    approval: { required: true, approverRole: 'data-protection-officer' },
    retention: { localTranscriptDays: 14 },
    updatedAt: iso(-2 * DAY),
    updatedBy: ADMIN_ACTOR,
  },
];

export const DOMAINS: readonly CustomDomain[] = [
  {
    id: 'dom_vendor',
    hostname: 'northwind.waylorn.example',
    kind: 'vendor_hosted',
    certificateMode: 'managed',
    edge: 'Cloudflare',
    steps: (['request', 'dns_verification', 'certificate', 'ingress_binding', 'idp_redirect', 'activation'] as const).map((step) => ({
      step,
      state: 'complete' as const,
      updatedAt: iso(-120 * DAY),
    })),
    dnsRecords: [],
  },
  {
    id: 'dom_custom',
    hostname: 'control.northwind.example',
    kind: 'custom_subdomain',
    certificateMode: 'customer_provided',
    edge: 'Customer ingress (F5 BIG-IP)',
    steps: [
      { step: 'request', state: 'complete', updatedAt: iso(-3 * DAY) },
      { step: 'dns_verification', state: 'complete', detail: 'TXT record verified', updatedAt: iso(-2 * DAY) },
      { step: 'certificate', state: 'blocked', detail: 'Waiting for customer-provided certificate chain (PEM) — uploaded chain missing intermediate CA', updatedAt: iso(-1 * DAY) },
      { step: 'ingress_binding', state: 'pending' },
      { step: 'idp_redirect', state: 'pending' },
      { step: 'activation', state: 'pending' },
    ],
    dnsRecords: [
      { type: 'TXT', name: '_waylorn-verify.control.northwind.example', value: 'wl-verify=7c1e4b0f9a' },
      { type: 'CNAME', name: 'control.northwind.example', value: 'edge.northwind.waylorn.example' },
    ],
  },
];

export const AUDIT: AuditRecord[] = seedAudit();

function seedAudit(): AuditRecord[] {
  const org = { id: 'org_northwind', slug: 'northwind', name: 'Northwind Industrial (fixture)' };
  const idp = { id: 'entra', displayName: 'Microsoft Entra ID (via Keycloak)', protocol: 'oidc' as const };
  const rand = prng(42);
  const actions: readonly (readonly [string, 'GREEN' | 'AMBER' | 'RED', string])[] = [
    ['asset.read_configuration', 'GREEN', 'Read configuration snapshot'],
    ['asset.view', 'GREEN', 'Viewed asset detail'],
    ['audit.export', 'GREEN', 'Requested audit export'],
    ['asset.change_configuration', 'AMBER', 'Change OPC UA subscription interval'],
    ['ai.policy.update', 'AMBER', 'Updated AI data policy'],
    ['asset.write_setpoint', 'RED', 'Write ram pressure setpoint'],
  ];
  const people = [
    { subject: 'u_keller', displayName: 'A. Keller', type: 'human' as const, identityProvider: idp },
    { subject: 'u_osei', displayName: 'K. Osei', type: 'human' as const, identityProvider: idp },
    { subject: 'svc_report', displayName: 'report-scheduler', type: 'service' as const },
    { subject: 'ai_assistant', displayName: 'AI assistant (Plant-local)', type: 'ai_assistant' as const },
  ];
  const records: AuditRecord[] = [];
  for (let i = 0; i < 480; i += 1) {
    const [action, safetyClass, summary] = actions[Math.floor(rand() * actions.length)]!;
    const actor = people[Math.floor(rand() * people.length)]!;
    const northwind = ASSETS.filter((a) => a.orgId === 'org_northwind');
    const asset = northwind[Math.floor(rand() * 20)]!.detail;
    const denied = safetyClass !== 'GREEN' ? rand() < 0.85 : rand() < 0.03;
    const at = BASE_TIME - i * 17 * MIN - Math.floor(rand() * 10 * MIN);
    records.push({
      id: `aud_${String(100000 + i)}`,
      occurredAt: new Date(at).toISOString(),
      actor,
      organization: org,
      site: { id: asset.context.site.id, code: asset.context.site.code },
      asset: { id: asset.id, tag: asset.tag },
      action,
      safetyClass,
      request: { summary: `${summary} on ${asset.tag}`, digest: `sha256:${(i * 2654435761).toString(16).padStart(8, '0')}${'0'.repeat(56)}` },
      decision: {
        outcome: denied ? 'deny' : 'permit',
        policy: { id: 'pol_ot_baseline', name: 'OT command baseline', version: '12', rule: safetyClass === 'GREEN' ? 'green.observe' : 'phase0.reject_consequential' },
        reasons: denied ? [safetyClass === 'GREEN' ? 'Principal lacks site scope' : 'Consequential execution disabled (ADR 0002)'] : [],
      },
      result: { status: denied ? 'not_executed' : 'success' },
      correlationId: `corr-${(i * 7919).toString(36)}`,
      integrity: { state: 'verified', chainPosition: 90_000 - i },
    });
  }
  return records;
}

/** Site as currently reported: connected sites have a fresh last-contact time. */
export function siteNow(site: Site): Site {
  if (site.connectivity.state !== 'connected') return site;
  return { ...site, connectivity: { ...site.connectivity, lastContactAt: new Date(Date.now() - 3_000).toISOString() } };
}

export const SITE_LIST = (orgId: string): Site[] =>
  SITES.filter((s) => s.orgId === orgId).map(({ orgId: _o, zones: _z, ...site }) => siteNow(site));
