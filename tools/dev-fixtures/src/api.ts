/**
 * DEVELOPMENT FIXTURE implementation of the draft control-plane API. Authorization rules
 * here are illustrative stand-ins for the .NET backend's RBAC + ABAC; they exist so the UI's
 * permission, denial and step-up states can be exercised.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ActionDefinition,
  AssetEvent,
  AssetReview,
  AssetSummary,
  AuditRecord,
  AiEgressRecord,
  AssistantTurn,
  CommandRecord,
  ConfigurationSnapshot,
  HealthDimension,
  ImpactAnalysis,
  LiveSignal,
  Prediction,
  PreflightResult,
  Problem,
  RelationType,
  ReliabilityMetric,
  ReliabilityReport,
  TelemetryBucket,
  TopologyCluster,
  TopologyEdge,
  TopologyGraph,
  TopologyNode,
  WorkOrder,
  AiDataPolicyUpdate,
} from '@waylorn/contracts';
import {
  AI_POLICIES,
  AI_PROVIDERS,
  ASSETS,
  AUDIT,
  BASE_TIME,
  DOMAINS,
  EDGES,
  INCIDENTS,
  SITE_LIST,
  SITES,
  assetById,
  hosts,
  iso,
  orgById,
  prng,
  type FixtureAsset,
} from './data.ts';
import { ACR_MFA, IDP_LABEL, readBody, type AuthenticatedCaller } from './oidc.ts';

export interface ControlState {
  /** normal: live updates flow. frozen: connection open, no signal updates. severed: stream refused. */
  stream: 'normal' | 'frozen' | 'severed';
  latencyMs: number;
  failApi: boolean;
}

export const control: ControlState = { stream: 'normal', latencyMs: 0, failApi: false };
export const openStreams = new Set<ServerResponse>();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  caller: AuthenticatedCaller;
  orgId: string;
  correlationId: string;
}

type Handler = (ctx: Ctx) => Promise<void> | void;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/\{(\w+)\}/g, (_, k: string) => {
      keys.push(k);
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, handler });
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

export function problem(res: ServerResponse, status: number, title: string, correlationId: string, extra: Partial<Problem> = {}): void {
  const body: Problem = { type: `https://waylorn.invalid/problems/${status}`, title, status, correlationId, ...extra };
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function paginate<T>(items: readonly T[], url: URL): { items: T[]; page: { nextCursor?: string; totalEstimate: number } } {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
  const cursor = url.searchParams.get('cursor');
  let offset = 0;
  if (cursor) {
    const decoded = Number(Buffer.from(cursor, 'base64url').toString('utf8').replace(/^o:/, ''));
    offset = Number.isInteger(decoded) && decoded >= 0 ? decoded : 0;
  }
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? Buffer.from(`o:${offset + limit}`).toString('base64url') : undefined;
  return { items: slice, page: { ...(next ? { nextCursor: next } : {}), totalEstimate: items.length } };
}

function summary(a: FixtureAsset): AssetSummary {
  const d = a.detail;
  return {
    id: d.id,
    kind: d.kind,
    name: d.name,
    tag: d.tag,
    ...(d.manufacturer ? { manufacturer: d.manufacturer } : {}),
    ...(d.model ? { model: d.model } : {}),
    ...(d.installedYear ? { installedYear: d.installedYear } : {}),
    context: d.context,
    lifecycle: d.lifecycle,
    health: d.health,
    connectivity: d.connectivity,
    identityConfidence: d.identityConfidence,
  };
}

function orgAsset(ctx: Ctx): FixtureAsset | undefined {
  const a = assetById(ctx.orgId, ctx.params['assetId'] ?? '');
  if (!a) problem(ctx.res, 404, 'Asset not found', ctx.correlationId, { detail: 'The asset does not exist in this organization or is outside your scope.' });
  return a;
}

function hasRole(caller: AuthenticatedCaller, role: string): boolean {
  return caller.user.roles.includes(role);
}

// ── Identity and tenancy ────────────────────────────────────────────────────────────────

route('GET', '/me', ({ res, caller }) => {
  const idp = IDP_LABEL[caller.user.idp] ?? { displayName: caller.user.idp, protocol: 'oidc' as const };
  send(res, 200, {
    subject: caller.user.sub,
    displayName: caller.user.name,
    email: caller.user.email,
    identityProvider: { id: caller.user.idp, ...idp },
    organizations: caller.user.orgs.flatMap((id) => {
      const o = orgById(id);
      return o ? [{ ...o, roles: [...caller.user.roles] }] : [];
    }),
  });
});

route('GET', '/orgs/{orgId}/sites', ({ res, orgId }) => send(res, 200, { items: SITE_LIST(orgId) }));

route('GET', '/orgs/{orgId}/hierarchy', ({ res, url, orgId }) => {
  const parentId = url.searchParams.get('parentId');
  const sites = SITES.filter((s) => s.orgId === orgId);
  const count = (pred: (a: FixtureAsset) => boolean) => ASSETS.filter((a) => a.orgId === orgId && pred(a)).length;
  if (!parentId) {
    const regions = [...new Set(sites.map((s) => s.regionName))];
    return send(res, 200, {
      items: regions.map((r) => ({ id: `region:${r}`, level: 'region', name: r, childCount: sites.filter((s) => s.regionName === r).length, assetCount: count((a) => a.detail.context.region === r) })),
    });
  }
  if (parentId.startsWith('region:')) {
    const r = parentId.slice(7);
    return send(res, 200, {
      items: sites.filter((s) => s.regionName === r).map((s) => ({ id: s.id, level: 'site', name: s.name, code: s.code, parentId, childCount: s.zones.length, assetCount: count((a) => a.detail.context.site.id === s.id) })),
    });
  }
  const site = sites.find((s) => s.id === parentId);
  if (site) {
    return send(res, 200, {
      items: site.zones.map((z) => ({ id: z.id, level: 'zone', name: z.name, parentId, childCount: z.lines.length, assetCount: count((a) => a.detail.context.zone?.id === z.id) })),
    });
  }
  const zone = sites.flatMap((s) => s.zones).find((z) => z.id === parentId);
  return send(res, 200, {
    items: (zone?.lines ?? []).map((l) => ({ id: l.id, level: 'line', name: l.name, parentId, childCount: 0, assetCount: count((a) => a.detail.context.line?.id === l.id) })),
  });
});

route('GET', '/orgs/{orgId}/overview', ({ res, orgId }) => {
  const sites = SITES.filter((s) => s.orgId === orgId);
  send(res, 200, {
    generatedAt: new Date().toISOString(),
    pendingApprovals: orgId === 'org_northwind' ? 1 : 0,
    sites: sites.map(({ orgId: _o, zones: _z, ...site }) => {
      const assets = ASSETS.filter((a) => a.detail.context.site.id === site.id);
      const health = { ok: 0, warning: 0, fault: 0, unknown: 0 };
      for (const a of assets) health[a.detail.health.state] += 1;
      const incidents = INCIDENTS.filter((i) => i.context.site.id === site.id && i.status !== 'resolved');
      return {
        site,
        assetHealth: health,
        openIncidents: {
          critical: incidents.filter((i) => i.severity === 'critical').length,
          warning: incidents.filter((i) => i.severity === 'warning').length,
          notice: incidents.filter((i) => i.severity === 'notice' || i.severity === 'info').length,
        },
        staleAssets: site.connectivity.state === 'connected' ? 0 : assets.length,
      };
    }),
  });
});

// ── Assets ──────────────────────────────────────────────────────────────────────────────

route('GET', '/orgs/{orgId}/assets', ({ res, url, orgId }) => {
  const sp = url.searchParams;
  const q = sp.get('q')?.toLowerCase();
  let items = ASSETS.filter((a) => a.orgId === orgId);
  const f = (key: string, get: (a: FixtureAsset) => string | undefined) => {
    const v = sp.get(key);
    if (v) items = items.filter((a) => get(a) === v);
  };
  f('siteId', (a) => a.detail.context.site.id);
  f('zoneId', (a) => a.detail.context.zone?.id);
  f('lineId', (a) => a.detail.context.line?.id);
  f('lifecycle', (a) => a.detail.lifecycle);
  const facetBase = items;
  f('kind', (a) => a.detail.kind);
  f('health', (a) => a.detail.health.state);
  if (q) {
    items = items.filter((a) =>
      [a.detail.tag, a.detail.name, a.detail.manufacturer, a.detail.model, a.detail.serialNumber?.value].some((s) => s?.toLowerCase().includes(q)),
    );
  }
  const sort = sp.get('sort') ?? 'tag';
  const healthRank = { fault: 0, warning: 1, unknown: 2, ok: 3 } as const;
  items = [...items].sort((a, b) => {
    if (sort === 'health') return healthRank[a.detail.health.state] - healthRank[b.detail.health.state] || a.detail.tag.localeCompare(b.detail.tag);
    if (sort === 'name') return a.detail.name.localeCompare(b.detail.name);
    if (sort === 'installedYear') return (a.detail.installedYear ?? 9999) - (b.detail.installedYear ?? 9999);
    if (sort === 'lastSeen') return (b.detail.connectivity.lastSeenAt ?? '').localeCompare(a.detail.connectivity.lastSeenAt ?? '');
    return a.detail.tag.localeCompare(b.detail.tag);
  });
  const facet = (get: (a: FixtureAsset) => string) => {
    const m = new Map<string, number>();
    for (const a of facetBase) m.set(get(a), (m.get(get(a)) ?? 0) + 1);
    return [...m].map(([value, count]) => ({ value, count }));
  };
  const page = paginate(items.map(summary), url);
  send(res, 200, { ...page, facets: { kind: facet((a) => a.detail.kind), health: facet((a) => a.detail.health.state) } });
});

function actionsFor(a: FixtureAsset, caller: AuthenticatedCaller): ActionDefinition[] {
  const readonly = hasRole(caller, 'auditor');
  const engineer = hasRole(caller, 'controls-engineer');
  const defs: ActionDefinition[] = [];
  const has = (op: string) => a.detail.capabilities.find((c) => c.operation === op);
  if (has('read_configuration')?.observed) {
    defs.push({
      action: 'asset.read_configuration',
      label: 'Capture configuration snapshot',
      description: 'Reads the current configuration into the site-local store. Does not change the asset.',
      safetyClass: 'GREEN',
      parameters: [],
      availability: readonly ? { action: 'asset.read_configuration', available: false, reason: 'Your role (auditor) is read-only.' } : { action: 'asset.read_configuration', available: true },
    });
  }
  if (has('change_configuration')) {
    defs.push({
      action: 'asset.change_configuration',
      label: 'Change OPC UA publishing interval',
      description: 'Changes the publishing interval of the OPC UA subscription used for monitoring.',
      safetyClass: 'AMBER',
      parameters: [{ name: 'interval_ms', label: 'Publishing interval', type: 'number', unit: 'ms', min: 100, max: 60000, required: true }],
      availability: engineer ? { action: 'asset.change_configuration', available: true } : { action: 'asset.change_configuration', available: false, reason: 'Requires the controls-engineer role for this site.' },
    });
  }
  if (has('write')) {
    defs.push({
      action: 'asset.write_setpoint',
      label: 'Write ram pressure setpoint',
      description: 'Writes a new ram pressure setpoint to the controller. Affects the physical pressing process.',
      safetyClass: 'RED',
      parameters: [{ name: 'setpoint_bar', label: 'Ram pressure setpoint', type: 'number', unit: 'bar', min: 50, max: 180, required: true }],
      availability: engineer ? { action: 'asset.write_setpoint', available: true } : { action: 'asset.write_setpoint', available: false, reason: 'Requires the controls-engineer role and a site-approved write capability.' },
    });
  }
  return defs;
}

route('GET', '/orgs/{orgId}/assets/{assetId}', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  send(ctx.res, 200, { ...a.detail, permittedActions: actionsFor(a, ctx.caller).map((d) => d.availability) });
});

route('GET', '/orgs/{orgId}/assets/{assetId}/actions', (ctx) => {
  const a = orgAsset(ctx);
  if (a) send(ctx.res, 200, { items: actionsFor(a, ctx.caller) });
});

interface SignalDef {
  key: string;
  label: string;
  unit?: string;
  intervalMs: number;
  base: number;
  amplitude: number;
  period: number;
  noise: number;
  limits?: LiveSignal['limits'];
  kind?: 'number' | 'state';
  states?: string[];
}

function signalsFor(a: FixtureAsset): SignalDef[] {
  switch (a.role) {
    case 'plc':
      return [
        { key: 'cycle_time', label: 'Scan cycle time', unit: 'ms', intervalMs: 1000, base: 12, amplitude: 2, period: 90_000, noise: 0.6, limits: { highWarning: 40, highAlarm: 100 } },
        { key: 'cpu_load', label: 'CPU load', unit: '%', intervalMs: 1000, base: 34, amplitude: 6, period: 120_000, noise: 2, limits: { highWarning: 80, highAlarm: 95 } },
        { key: 'mode', label: 'Operating mode', intervalMs: 1000, base: 0, amplitude: 0, period: 1, noise: 0, kind: 'state', states: ['RUN'] },
        { key: 'conn_quality', label: 'Communication quality', unit: '%', intervalMs: 2000, base: 99.2, amplitude: 0.4, period: 60_000, noise: 0.2, limits: { lowWarning: 95, lowAlarm: 90 } },
      ];
    case 'machine':
      return [
        { key: 'oil_temp', label: 'Hydraulic oil temperature', unit: '°C', intervalMs: 5000, base: 61, amplitude: 3, period: 600_000, noise: 0.4, limits: { highWarning: 60, highAlarm: 68 } },
        { key: 'ram_pressure', label: 'Ram pressure', unit: 'bar', intervalMs: 5000, base: 142, amplitude: 18, period: 30_000, noise: 2, limits: { highWarning: 175, highAlarm: 185 } },
        { key: 'strokes', label: 'Stroke rate', unit: 'strokes/min', intervalMs: 5000, base: 11, amplitude: 1, period: 300_000, noise: 0.3 },
        { key: 'state', label: 'Machine state', intervalMs: 5000, base: 0, amplitude: 0, period: 1, noise: 0, kind: 'state', states: ['PRODUCING'] },
      ];
    case 'sensor':
      return [{ key: 'pv', label: 'Process value', unit: 'bar', intervalMs: 1000, base: 142, amplitude: 18, period: 30_000, noise: 1.5 }];
    case 'drive':
      return [
        { key: 'speed', label: 'Motor speed', unit: 'rpm', intervalMs: 1000, base: 1480, amplitude: 20, period: 60_000, noise: 4 },
        { key: 'current', label: 'Motor current', unit: 'A', intervalMs: 1000, base: 72, amplitude: 9, period: 30_000, noise: 1 },
      ];
    case 'edge_server':
      return [
        { key: 'cpu', label: 'CPU utilization', unit: '%', intervalMs: 15000, base: 41, amplitude: 10, period: 600_000, noise: 3 },
        { key: 'mem', label: 'Memory utilization', unit: '%', intervalMs: 15000, base: 63, amplitude: 2, period: 600_000, noise: 0.5 },
      ];
    default:
      return [{ key: 'reachable', label: 'Reachability', intervalMs: 10000, base: 0, amplitude: 0, period: 1, noise: 0, kind: 'state', states: ['REACHABLE'] }];
  }
}

function sample(def: SignalDef, t: number, seed: number): number {
  const rand = prng(Math.floor(t / def.intervalMs) ^ seed);
  return def.base + def.amplitude * Math.sin((2 * Math.PI * t) / def.period) + (rand() - 0.5) * 2 * def.noise;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function liveSignal(a: FixtureAsset, def: SignalDef, now: number): LiveSignal {
  const siteState = SITES.find((s) => s.id === a.detail.context.site.id)?.connectivity;
  const disconnected = siteState?.state === 'disconnected';
  const observed = disconnected ? Date.parse(siteState.lastContactAt ?? iso(-DAY)) : now - (now % def.intervalMs);
  const value = def.kind === 'state' ? (def.states?.[0] ?? 'UNKNOWN') : Math.round(sample(def, observed, hashId(a.detail.id)) * 100) / 100;
  return {
    key: def.key,
    label: def.label,
    ...(def.unit ? { unit: def.unit } : {}),
    value,
    quality: disconnected ? 'uncertain' : 'good',
    observedAt: new Date(observed).toISOString(),
    expectedIntervalMs: def.intervalMs,
    source: a.role === 'machine' ? 'site-agent/serial-poller' : a.role === 'edge_server' ? 'otel-collector' : 'site-agent/opcua',
    ...(def.limits ? { limits: def.limits } : {}),
  };
}

route('GET', '/orgs/{orgId}/assets/{assetId}/live', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const now = Date.now();
  send(ctx.res, 200, { assetId: a.detail.id, serverTime: new Date(now).toISOString(), signals: signalsFor(a).map((d) => liveSignal(a, d, now)) });
});

route('GET', '/orgs/{orgId}/assets/{assetId}/live/stream', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  if (control.stream === 'severed') {
    problem(ctx.res, 503, 'Live stream unavailable', ctx.correlationId, { detail: 'Fixture control: stream severed.' });
    return;
  }
  const { res } = ctx;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  openStreams.add(res);
  let id = Number(ctx.req.headers['last-event-id'] ?? 0) || 0;
  const defs = signalsFor(a);
  const siteDisconnected = SITES.find((s) => s.id === a.detail.context.site.id)?.connectivity.state === 'disconnected';
  const tick = () => {
    const now = Date.now();
    if (control.stream === 'normal' && !siteDisconnected) {
      for (const def of defs) {
        if (Math.floor(now / 1000) % Math.max(1, def.intervalMs / 1000) !== 0) continue;
        id += 1;
        res.write(`id: ${id}\nevent: signal\ndata: ${JSON.stringify(liveSignal(a, def, now))}\n\n`);
      }
    }
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ serverTime: new Date(now).toISOString() })}\n\n`);
  };
  tick();
  const timer = setInterval(tick, 1000);
  const close = () => {
    clearInterval(timer);
    openStreams.delete(res);
  };
  res.on('close', close);
});

route('GET', '/orgs/{orgId}/assets/{assetId}/telemetry/signals', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  send(ctx.res, 200, {
    items: signalsFor(a)
      .filter((d) => d.kind !== 'state')
      .map((d) => ({ key: d.key, label: d.label, ...(d.unit ? { unit: d.unit } : {}), retention: 'P400D' })),
  });
});

route('GET', '/orgs/{orgId}/assets/{assetId}/telemetry/series', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const sp = ctx.url.searchParams;
  const def = signalsFor(a).find((d) => d.key === sp.get('signal') && d.kind !== 'state');
  const from = Date.parse(sp.get('from') ?? '');
  const to = Date.parse(sp.get('to') ?? '');
  const maxPoints = Math.min(2000, Math.max(10, Number(sp.get('maxPoints') ?? 600) || 600));
  if (!def || Number.isNaN(from) || Number.isNaN(to) || to <= from) {
    problem(ctx.res, 400, 'Invalid series request', ctx.correlationId, { detail: 'signal, from and to are required; to must be after from.' });
    return;
  }
  const bucketMs = Math.max(def.intervalMs, Math.ceil((to - from) / maxPoints));
  const siteConn = SITES.find((s) => s.id === a.detail.context.site.id)?.connectivity;
  const disconnectedSince = siteConn?.state === 'disconnected' ? Date.parse(siteConn.lastContactAt ?? '') : Infinity;
  const gapFrom = BASE_TIME - 3 * DAY;
  const gapTo = gapFrom + 2 * HOUR;
  const buckets: TelemetryBucket[] = [];
  const seed = hashId(a.detail.id);
  for (let t = from - (from % bucketMs); t < to; t += bucketMs) {
    if ((t >= gapFrom && t < gapTo) || t >= disconnectedSince) continue;
    const samples = Math.max(1, Math.min(20, Math.round(bucketMs / def.intervalMs)));
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      const v = sample(def, t + (i * bucketMs) / samples, seed);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    const r = (v: number) => Math.round(v * 100) / 100;
    buckets.push({ t: new Date(t).toISOString(), min: r(min), mean: r(sum / samples), max: r(max), count: Math.round(bucketMs / def.intervalMs) });
  }
  const gaps: { from: string; to: string; reason: 'collector_offline' | 'site_disconnected' }[] = [];
  if (gapTo > from && gapFrom < to) gaps.push({ from: new Date(Math.max(gapFrom, from)).toISOString(), to: new Date(Math.min(gapTo, to)).toISOString(), reason: 'collector_offline' });
  if (disconnectedSince < to) gaps.push({ from: new Date(Math.max(disconnectedSince, from)).toISOString(), to: new Date(to).toISOString(), reason: 'site_disconnected' });
  send(ctx.res, 200, {
    signal: def.key,
    label: def.label,
    ...(def.unit ? { unit: def.unit } : {}),
    resolutionSeconds: Math.round(bucketMs / 1000),
    buckets,
    gaps,
    provenance: { source: 'site-telemetry-store (fixture generator)', computedAt: new Date().toISOString() },
  });
});

// ── Reliability and ML ─────────────────────────────────────────────────────────────────

const METHOD = { id: 'r-reliability/core', version: '1.4.0', description: 'R reliability package: exponential MTBF MLE with χ² interval; availability from state log' };

function metric(key: ReliabilityMetric['key'], label: string, unit: string, value: number | undefined, interval: [number, number] | undefined, n: number, coverage: number): ReliabilityMetric {
  return {
    key,
    label,
    unit,
    ...(value !== undefined ? { value } : { insufficientDataReason: 'Fewer than 3 failure events in the period.' }),
    ...(interval && value !== undefined ? { interval: { lower: interval[0], upper: interval[1], level: 0.95 } } : {}),
    sampleSize: n,
    method: METHOD,
    dataCoverage: coverage,
  };
}

route('GET', '/orgs/{orgId}/assets/{assetId}/reliability', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const period = ctx.url.searchParams.get('period') ?? 'P1Y';
  const days = period === 'P3M' ? 91 : period === 'P3Y' ? 1095 : 365;
  const scale = days / 365;
  const now = BASE_TIME;
  const old = a.detail.id === 'ast_press1991';
  const sensorOnly = a.role === 'sensor';
  const rand = prng(hashId(a.detail.id));
  const failures = sensorOnly ? 1 : Math.max(2, Math.round((old ? 38 : 4 + rand() * 6) * scale));
  const hours = days * 24;
  const mtbf = hours / failures;
  const mttr = old ? 4.6 : 1.2 + rand() * 1.5;
  const unplanned = failures * mttr;
  const planned = (old ? 180 : 96) * scale;
  const availability = 1 - (unplanned + planned) / hours;
  const insufficient = sensorOnly;
  const dims: HealthDimension[] = [
    { dimension: 'controller_health', label: 'Controller health', value: 0.97, unit: 'ratio', status: 'nominal', method: { id: 'plc-health', version: '0.3.0', description: 'Diagnostic buffer and scan-time rules' } },
    { dimension: 'machine_health', label: 'Machine health', ...(old ? { value: 0.71 } : { value: 0.93 }), unit: 'ratio', status: old ? 'degraded' : 'nominal', method: { id: 'machine-health', version: '0.2.1', description: 'Condition indicators vs. baseline' } },
    { dimension: 'process_efficiency', label: 'Process efficiency', value: 0.88, unit: 'ratio', status: 'watch', method: { id: 'process-eff', version: '0.1.0', description: 'Stroke rate vs. design rate' } },
    { dimension: 'production_efficiency', label: 'Production efficiency (OEE)', status: 'insufficient_data', method: { id: 'oee', version: '0.1.0', description: 'Requires MES good-part counts (integration not configured)' } },
    { dimension: 'energy_efficiency', label: 'Energy efficiency', value: 1.14, unit: 'kWh/stroke', status: 'watch', method: { id: 'energy', version: '0.1.0', description: 'Sub-metered energy per stroke' } },
  ];
  const report: ReliabilityReport = {
    assetId: a.detail.id,
    periodStart: new Date(now - days * DAY).toISOString(),
    periodEnd: new Date(now).toISOString(),
    computedAt: iso(-2 * HOUR),
    metrics: [
      metric('availability', 'Availability', 'ratio', insufficient ? undefined : availability, [availability - 0.004, Math.min(1, availability + 0.003)], Math.round(hours), 0.97),
      metric('mtbf', 'Mean time between failures', 'h', insufficient ? undefined : mtbf, [mtbf * 0.62, mtbf * 1.71], failures, 0.97),
      metric('mttr', 'Mean time to repair', 'h', insufficient ? undefined : mttr, [mttr * 0.7, mttr * 1.45], failures, 0.93),
      metric('failure_count', 'Failures', 'events', insufficient ? undefined : failures, undefined, failures, 0.97),
      metric('unplanned_downtime', 'Unplanned downtime', 'h', insufficient ? undefined : unplanned, undefined, failures, 0.97),
      metric('planned_downtime', 'Planned downtime', 'h', insufficient ? undefined : planned, undefined, Math.round(12 * scale), 0.99),
      metric('maintenance_count', 'Maintenance activities', 'events', insufficient ? undefined : Math.round(12 * scale), undefined, Math.round(12 * scale), 0.99),
    ],
    dimensions: a.detail.kind === 'IndustrialAsset' ? dims : [],
    trend: Array.from({ length: 4 }, (_, i) => {
      const start = new Date(now - (4 - i) * (days / 4) * DAY).toISOString();
      const f = Math.max(0, Math.round((failures / 4) * (old ? 0.6 + i * 0.3 : 1)));
      return { periodStart: start, failures: f, availability: Math.min(0.9999, availability + (old ? 0.01 - i * 0.007 : 0)) };
    }),
    ...(a.role === 'plc'
      ? {
          cohort: {
            label: 'S7-1500 controllers in press applications (org-wide)',
            memberCount: 27,
            comparisons: [
              { metricKey: 'mtbf', label: 'MTBF', unit: 'h', assetValue: mtbf, cohortP25: 980, cohortMedian: 1310, cohortP75: 1820 },
              { metricKey: 'mttr', label: 'MTTR', unit: 'h', assetValue: mttr, cohortP25: 1.1, cohortMedian: 1.6, cohortP75: 2.4 },
            ],
          },
        }
      : {}),
    notes: old
      ? [
          'Failure frequency increased in the last two quarters (trend test p = 0.03).',
          'Unplanned stops correlate with hydraulic oil temperature above 60 °C (r = 0.41). Correlation only; causation has not been established.',
        ]
      : ['Metrics cover controller-attributed stops only; upstream supply interruptions are excluded.'],
    provenance: { source: 'analytics/r-reliability (fixture)', computedAt: iso(-2 * HOUR) },
  };
  send(ctx.res, 200, report);
});

function predictionsFor(a: FixtureAsset): Prediction[] {
  const model = (name: string, version: string) => ({ name, version, trainedAt: iso(-21 * DAY), lineageRef: `mlflow://models/${name}/${version}` });
  if (a.detail.id === 'ast_press1991') {
    return [
      {
        id: 'pred_fr_1',
        kind: 'failure_risk',
        label: 'Failure risk (next 90 days)',
        summary: 'Probability of an unplanned hydraulic stop requiring repair in the next 90 days.',
        estimate: { value: 0.34, unit: 'ratio', interval: { lower: 0.21, upper: 0.49, level: 0.8 } },
        model: model('hydraulic-failure-risk', '2.3.1'),
        inferredAt: iso(-40 * MIN),
        dataFreshness: { latestInputAt: iso(-45 * MIN), coverage: 0.86 },
        contributingSignals: [
          { signal: 'oil_temp', label: 'Hydraulic oil temperature (30-day mean)', contribution: 0.46 },
          { signal: 'stop_count', label: 'Unplanned stops (90 days)', contribution: 0.31 },
          { signal: 'ram_pressure', label: 'Ram pressure variance', contribution: 0.14 },
        ],
        status: 'current',
      },
      {
        id: 'pred_rul_1',
        kind: 'remaining_useful_life',
        label: 'Remaining useful life (hydraulic pump)',
        summary: 'Estimated time until pump performance falls below maintenance threshold.',
        estimate: { value: 14, unit: 'months', interval: { lower: 7, upper: 26, level: 0.8 } },
        confidence: 0.55,
        model: model('pump-rul-weibull', '1.0.4'),
        inferredAt: iso(-26 * HOUR),
        dataFreshness: { latestInputAt: iso(-27 * HOUR), coverage: 0.62 },
        contributingSignals: [{ signal: 'oil_temp', label: 'Oil temperature', contribution: 0.52 }, { signal: 'strokes', label: 'Cumulative strokes', contribution: 0.48 }],
        status: 'stale',
      },
      {
        id: 'pred_an_1',
        kind: 'anomaly',
        label: 'Oil temperature anomaly',
        summary: 'Oil temperature above seasonal baseline for this machine.',
        category: 'elevated',
        confidence: 0.78,
        model: model('multivariate-anomaly', '0.9.0'),
        inferredAt: iso(-5 * MIN),
        dataFreshness: { latestInputAt: iso(-6 * MIN), coverage: 0.98 },
        contributingSignals: [{ signal: 'oil_temp', label: 'Hydraulic oil temperature', contribution: 0.81 }, { signal: 'ambient', label: 'Hall ambient temperature', contribution: 0.19 }],
        status: 'current',
      },
    ];
  }
  if (a.detail.id === 'ast_gw01') {
    return [
      {
        id: 'pred_cd_1',
        kind: 'communication_degradation',
        label: 'Communication degradation',
        summary: 'Serial retry rate trending upward on the RS-232 link.',
        category: 'elevated',
        confidence: 0.64,
        model: model('comm-degradation', '0.4.2'),
        inferredAt: iso(-12 * MIN),
        dataFreshness: { latestInputAt: iso(-13 * MIN), coverage: 0.95 },
        contributingSignals: [{ signal: 'serial_retries', label: 'Serial retries per hour', contribution: 0.88 }, { signal: 'frame_errors', label: 'Framing errors', contribution: 0.12 }],
        status: 'current',
      },
    ];
  }
  if (a.detail.id === 'ast_pt2031') {
    return [
      {
        id: 'pred_sd_1',
        kind: 'sensor_drift',
        label: 'Sensor drift',
        summary: 'Deviation from redundant pressure measurement.',
        estimate: { value: 1.8, unit: 'bar', interval: { lower: 0.9, upper: 2.7, level: 0.9 } },
        model: model('sensor-drift', '1.1.0'),
        inferredAt: iso(-3 * HOUR),
        dataFreshness: { latestInputAt: iso(-3 * HOUR), coverage: 0.99 },
        contributingSignals: [{ signal: 'pv_residual', label: 'Residual vs. redundant sensor', contribution: 1 }],
        status: 'current',
      },
    ];
  }
  return [];
}

route('GET', '/orgs/{orgId}/assets/{assetId}/predictions', (ctx) => {
  const a = orgAsset(ctx);
  if (a) send(ctx.res, 200, { items: predictionsFor(a) });
});

// ── Events, security, configuration, maintenance ─────────────────────────────────────────

function eventsFor(a: FixtureAsset): AssetEvent[] {
  const rand = prng(hashId(a.detail.id) ^ 7);
  const templates: readonly [AssetEvent['severity'], AssetEvent['category'], string][] = [
    ['info', 'state_change', 'Mode changed to RUN'],
    ['notice', 'communication', 'Session re-established after 3 retries'],
    ['warning', 'alarm', 'High warning limit exceeded'],
    ['info', 'maintenance', 'Work order closed'],
    ['notice', 'configuration', 'Configuration snapshot differs from previous'],
    ['critical', 'alarm', 'High alarm limit exceeded'],
    ['warning', 'security', 'Unexpected engineering connection attempt blocked by DMZ firewall'],
    ['info', 'communication', 'Heartbeat restored'],
  ];
  const count = 1200;
  const out: AssetEvent[] = [];
  let t = BASE_TIME - 2 * MIN;
  for (let i = 0; i < count; i += 1) {
    t -= Math.floor(rand() * 45 * MIN);
    const tpl = templates[Math.floor(rand() * templates.length)]!;
    out.push({
      id: `evt_${a.detail.id}_${i}`,
      occurredAt: new Date(t).toISOString(),
      receivedAt: new Date(t + Math.floor(rand() * 2000)).toISOString(),
      severity: tpl[0],
      category: tpl[1],
      message: tpl[2],
      source: a.role === 'machine' ? 'site-agent/serial-poller' : 'site-agent/opcua',
    });
  }
  return out;
}

route('GET', '/orgs/{orgId}/assets/{assetId}/events', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  let items = eventsFor(a);
  const sev = ctx.url.searchParams.get('severity');
  const cat = ctx.url.searchParams.get('category');
  if (sev) items = items.filter((e) => e.severity === sev);
  if (cat) items = items.filter((e) => e.category === cat);
  send(ctx.res, 200, paginate(items, ctx.url));
});

route('GET', '/orgs/{orgId}/assets/{assetId}/security', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const eol = a.detail.extension.kind === 'IndustrialAsset' && a.detail.extension.vendorSupport !== 'supported';
  send(ctx.res, 200, {
    assessedAt: iso(-6 * DAY),
    zone: a.detail.context.zone?.name ? `${a.detail.context.zone.name} cell zone` : 'Site operations zone',
    targetSecurityLevel: 'SL-T 2',
    vulnerabilities: eol
      ? [
          { id: 'FIXTURE-ADV-0007', title: 'Unauthenticated diagnostic access over legacy protocol (fixture advisory)', severity: 'warning', cvss: 7.5, status: 'accepted', source: 'Fixture advisory feed', compensatingControl: 'Reachable only via serial server in cell zone; conduit restricted to site agent.' },
          { id: 'FIXTURE-ADV-0012', title: 'Firmware no longer receives security updates', severity: 'notice', status: 'accepted', source: 'Vendor lifecycle notice (fixture)' },
        ]
      : a.role === 'plc'
        ? [{ id: 'FIXTURE-ADV-0003', title: 'Web server denial of service (fixture advisory)', severity: 'warning', cvss: 5.3, status: 'mitigated', source: 'Fixture advisory feed', compensatingControl: 'Integrated web server disabled.' }]
        : [],
    exposures: [{ conduit: 'Cell zone → Site operations (via SW-P3-CORE)', description: 'Allowlisted OPC UA (4840/tcp) to site agent only.' }],
    provenance: { source: 'security/assessment (fixture)', computedAt: iso(-6 * DAY) },
  });
});

route('GET', '/orgs/{orgId}/assets/{assetId}/configuration', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const snapshots: ConfigurationSnapshot[] = a.detail.capabilities.some((c) => c.operation === 'read_configuration' && c.observed)
    ? Array.from({ length: 6 }, (_, i) => ({
        id: `cfg_${a.detail.id}_${i}`,
        capturedAt: iso(-(i * 7 + 1) * DAY),
        source: 'site-agent/opcua',
        digest: `sha256:${hashId(`${a.detail.id}${i < 2 ? 0 : i}`).toString(16).padStart(8, '0')}${'ab'.repeat(28)}`,
        sizeBytes: 1_842_176 + i * 1024,
        ...(i === 2 ? { changeSummary: 'OB35 cyclic interrupt interval changed', differsFromPrevious: true } : { differsFromPrevious: false }),
      }))
    : [];
  send(ctx.res, 200, { storageLocation: `Site-local store, ${a.detail.context.site.name} (content never leaves the site)`, items: snapshots });
});

route('GET', '/orgs/{orgId}/assets/{assetId}/maintenance', (ctx) => {
  const a = orgAsset(ctx);
  if (!a) return;
  const items: WorkOrder[] = [
    { id: 'WO-2026-4471', title: 'Quarterly inspection', type: 'inspection', status: 'scheduled', dueAt: iso(6 * DAY), system: 'SAP PM' },
    { id: 'WO-2026-4102', title: 'Replace hydraulic oil filter', type: 'preventive', status: 'completed', completedAt: iso(-24 * DAY), system: 'SAP PM' },
    { id: 'WO-2026-3977', title: 'Investigate intermittent communication loss', type: 'corrective', status: 'completed', completedAt: iso(-51 * DAY), system: 'SAP PM' },
  ];
  send(ctx.res, 200, { items: a.role === 'machine' || a.role === 'plc' ? items : items.slice(0, 1) });
});

// ── Topology ─────────────────────────────────────────────────────────────────────────────

const ADJ = new Map<string, TopologyEdge[]>();
for (const edge of EDGES) {
  for (const id of [edge.source, edge.target]) {
    const list = ADJ.get(id) ?? [];
    list.push(edge);
    ADJ.set(id, list);
  }
}

function topoNode(a: FixtureAsset, distance: number, hidden = 0): TopologyNode {
  const d = a.detail;
  return {
    id: d.id,
    kind: d.kind,
    role: a.role,
    name: d.name,
    tag: d.tag,
    health: d.health.state,
    siteCode: d.context.site.code,
    ...(d.context.zone ? { zoneName: d.context.zone.name } : {}),
    ...(d.context.line ? { lineName: d.context.line.name } : {}),
    distance,
    ...(hidden > 0 ? { hiddenNeighborCount: hidden } : {}),
  };
}

const CLUSTER_THRESHOLD = 8;

route('GET', '/orgs/{orgId}/topology/neighborhood', ({ res, url, orgId, correlationId }) => {
  const focus = assetById(orgId, url.searchParams.get('focus') ?? '');
  if (!focus) return problem(res, 404, 'Focus asset not found', correlationId);
  const depth = Math.min(4, Math.max(1, Number(url.searchParams.get('depth') ?? 2) || 2));
  const nodeLimit = Math.min(300, Math.max(10, Number(url.searchParams.get('nodeLimit') ?? 150) || 150));
  const relFilter = url.searchParams.get('relations')?.split(',').filter(Boolean) as RelationType[] | undefined;
  const allowed = (e: TopologyEdge) => !relFilter || relFilter.length === 0 || relFilter.includes(e.relation);

  const nodes = new Map<string, number>([[focus.detail.id, 0]]);
  const edges = new Map<string, TopologyEdge>();
  const clusters: TopologyCluster[] = [];
  let truncated = false;
  let frontier = [focus.detail.id];
  for (let d = 1; d <= depth && frontier.length > 0; d += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      const groups = new Map<string, { edge: TopologyEdge; other: FixtureAsset }[]>();
      for (const edge of (ADJ.get(id) ?? []).filter(allowed)) {
        const otherId = edge.source === id ? edge.target : edge.source;
        if (nodes.has(otherId)) {
          if (nodes.has(edge.source) && nodes.has(edge.target)) edges.set(edge.id, edge);
          continue;
        }
        const other = assetById(orgId, otherId);
        if (!other) continue;
        const key = `${edge.relation}|${other.role}`;
        const g = groups.get(key) ?? [];
        g.push({ edge, other });
        groups.set(key, g);
      }
      for (const [key, members] of groups) {
        if (members.length > CLUSTER_THRESHOLD || nodes.size + members.length > nodeLimit) {
          const [relation, role] = key.split('|') as [RelationType, string];
          const health = { ok: 0, warning: 0, fault: 0, unknown: 0 };
          for (const m of members) health[m.other.detail.health.state] += 1;
          if (nodes.size + members.length > nodeLimit) truncated = true;
          clusters.push({ id: `cl_${id}_${key}`, label: `${members.length} × ${role.replace(/_/g, ' ')}`, grouping: 'role', memberCount: members.length, attachedTo: id, relation, healthCounts: health });
          continue;
        }
        for (const m of members) {
          nodes.set(m.other.detail.id, d);
          edges.set(m.edge.id, m.edge);
          next.push(m.other.detail.id);
        }
      }
    }
    frontier = next;
  }
  // Edges among included nodes, and hidden-neighbour counts on the outer ring.
  for (const id of nodes.keys()) for (const e of ADJ.get(id) ?? []) if (allowed(e) && nodes.has(e.source) && nodes.has(e.target)) edges.set(e.id, e);
  const graph: TopologyGraph = {
    focusId: focus.detail.id,
    depth,
    nodes: [...nodes].map(([id, dist]) => {
      const a = assetById(orgId, id)!;
      const clustered = new Set(clusters.filter((c) => c.attachedTo === id).map((c) => c.id));
      const hidden = clustered.size > 0 ? 0 : (ADJ.get(id) ?? []).filter((e) => allowed(e) && !(nodes.has(e.source) && nodes.has(e.target))).length;
      return topoNode(a, dist, hidden);
    }),
    edges: [...edges.values()],
    clusters,
    truncated,
    computedAt: new Date().toISOString(),
  };
  send(res, 200, graph);
});

const FORWARD: Readonly<Partial<Record<RelationType, 'source_to_target' | 'target_to_source'>>> = {
  CONTROLS: 'source_to_target',
  SENDS_DATA_TO: 'source_to_target',
  DEPENDS_ON: 'target_to_source',
  HOSTED_ON: 'target_to_source',
};

route('GET', '/orgs/{orgId}/topology/impact', ({ res, url, orgId, correlationId }) => {
  const root = assetById(orgId, url.searchParams.get('assetId') ?? '');
  const direction = url.searchParams.get('direction') === 'upstream' ? 'upstream' : 'downstream';
  if (!root) return problem(res, 404, 'Asset not found', correlationId);
  const seen = new Map<string, { distance: number; path: string[] }>([[root.detail.id, { distance: 0, path: [] }]]);
  let frontier = [root.detail.id];
  let truncated = false;
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const here = seen.get(id)!;
      for (const e of ADJ.get(id) ?? []) {
        const dir = FORWARD[e.relation];
        if (!dir) continue;
        const downstreamFrom = dir === 'source_to_target' ? e.source : e.target;
        const downstreamTo = dir === 'source_to_target' ? e.target : e.source;
        const [from, to] = direction === 'downstream' ? [downstreamFrom, downstreamTo] : [downstreamTo, downstreamFrom];
        if (from !== id || seen.has(to)) continue;
        if (seen.size >= 200) {
          truncated = true;
          continue;
        }
        seen.set(to, { distance: here.distance + 1, path: [...here.path, e.id] });
        next.push(to);
      }
    }
    frontier = next;
  }
  const body: ImpactAnalysis = {
    rootId: root.detail.id,
    direction,
    relations: Object.keys(FORWARD) as RelationType[],
    affected: [...seen]
      .filter(([id]) => id !== root.detail.id)
      .map(([id, v]) => ({ node: topoNode(assetById(orgId, id)!, v.distance), distance: v.distance, path: v.path }))
      .sort((a, b) => a.distance - b.distance || a.node.tag.localeCompare(b.node.tag)),
    computedAt: new Date().toISOString(),
    truncated,
  };
  send(res, 200, body);
});

// ── Infrastructure, incidents, reviews ─────────────────────────────────────────────────

route('GET', '/orgs/{orgId}/infrastructure/hosts', ({ res, url, orgId }) => {
  let items = orgId === 'org_northwind' ? hosts() : [];
  const siteId = url.searchParams.get('siteId');
  const platform = url.searchParams.get('platform');
  if (siteId) items = items.filter((h) => h.asset.context.site.id === siteId);
  if (platform) items = items.filter((h) => h.platform === platform);
  send(res, 200, paginate(items, url));
});

route('GET', '/orgs/{orgId}/cloud/costs', ({ res, url }) => {
  const groupBy = (url.searchParams.get('groupBy') ?? 'provider') as 'provider' | 'account' | 'site';
  const updated = iso(-5 * HOUR);
  send(res, 200, {
    currency: 'EUR',
    groupBy,
    rows: [
      { key: 'azure', label: 'Microsoft Azure — nw-analytics-prod', provider: 'azure', hourlyEstimate: 3.42, dailyEstimate: 82.1, monthToDate: 2216.4, monthlyForecast: 2463, sourceUpdatedAt: updated, basis: 'provider_billing_api' },
      { key: 'aws', label: 'AWS — nw-backup (eu-central-1)', provider: 'aws', hourlyEstimate: 0.61, dailyEstimate: 14.6, monthToDate: 394.2, monthlyForecast: 438, sourceUpdatedAt: updated, basis: 'provider_billing_api' },
      { key: 'hetzner', label: 'Hetzner — dedicated nodes (3)', provider: 'hetzner', hourlyEstimate: 0.48, dailyEstimate: 11.5, monthToDate: 310.5, monthlyForecast: 345, sourceUpdatedAt: iso(-26 * HOUR), basis: 'rate_card_estimate' },
      { key: 'onprem', label: 'On-premises (allocated)', provider: 'on_premises', dailyEstimate: 41.0, monthToDate: 1107, monthlyForecast: 1230, sourceUpdatedAt: iso(-7 * DAY), basis: 'manual_allocation' },
    ],
    notes: [
      'Provider billing data typically lags by 8–24 hours.',
      'Hetzner figures are rate-card estimates; the provider exposes no per-hour billing API.',
      'On-premises figures are manual allocations entered by Finance.',
    ],
  });
});

route('GET', '/orgs/{orgId}/incidents', ({ res, url, orgId }) => {
  let items = INCIDENTS.filter((i) => i.context.organization.id === orgId);
  const status = url.searchParams.get('status');
  if (status) items = items.filter((i) => i.status === status);
  send(res, 200, paginate(items, url));
});

function review(orgId: string): AssetReview {
  const pick = ['ast_press1991', 'ast_plc117', 'ast_pt2031', 'ast_plc203', 'ast_gw01'].map((id) => assetById(orgId, id)).filter((a): a is FixtureAsset => Boolean(a));
  const preds = (a: FixtureAsset) => predictionsFor(a).find((p) => p.kind === 'failure_risk');
  return {
    id: 'rev_2026_q3',
    title: '2026 Q3 asset review — Munich Plant 3',
    periodLabel: '2026 Q3',
    status: 'in_review',
    candidateCount: pick.length,
    scope: 'DE-MUC-P3',
    dueAt: iso(9 * DAY),
    computedAt: iso(-1 * DAY),
    method: { id: 'asset-review/rules', version: '0.5.0', description: 'Rule-based screening: age, vendor support, reliability trend, open vulnerabilities' },
    candidates: pick.map((a) => {
      const age = 2026 - (a.detail.installedYear ?? 2026);
      const ext = a.detail.extension;
      const support = ext.kind === 'IndustrialAsset' || ext.kind === 'NetworkAsset' ? (ext.kind === 'IndustrialAsset' ? ext.vendorSupport : 'supported') : 'unknown';
      const old = a.detail.id === 'ast_press1991';
      const risk = preds(a);
      return {
        asset: summary(a),
        ageYears: age,
        vendorSupport: support,
        ...(a.role === 'sensor' ? {} : { availability: old ? 0.962 : a.detail.id === 'ast_plc117' ? 0.981 : 0.996, mtbfHours: old ? 212 : a.detail.id === 'ast_plc117' ? 640 : 1460 }),
        unplannedDowntimeHours: old ? 174.8 : a.detail.id === 'ast_plc117' ? 41.2 : 10.8,
        trend: old ? 'degrading' : a.detail.id === 'ast_plc117' ? 'degrading' : a.role === 'sensor' ? 'insufficient_data' : 'stable',
        ...(risk ? { failureRisk: risk } : {}),
        recommendation: old ? 'plan_replacement' : a.detail.id === 'ast_plc117' ? 'monitor' : 'retain',
        rationale: old
          ? ['Installed 1991; vendor support ended.', 'Failure frequency increasing over two quarters.', 'Unplanned downtime 16× cohort median.']
          : a.detail.id === 'ast_plc117'
            ? ['Firmware line in limited vendor support.', 'Major fault in current quarter (incident inc_1042).']
            : ['Within cohort interquartile range.'],
      };
    }),
  };
}

route('GET', '/orgs/{orgId}/reliability/reviews', ({ res, orgId }) => {
  const r = review(orgId);
  send(res, 200, {
    items: orgId === 'org_northwind'
      ? [
          { id: r.id, title: r.title, periodLabel: r.periodLabel, status: r.status, candidateCount: r.candidateCount, scope: r.scope, ...(r.dueAt ? { dueAt: r.dueAt } : {}) },
          { id: 'rev_2025', title: '2025 annual asset review — all sites', periodLabel: '2025', status: 'approved', candidateCount: 64, scope: 'Organization' },
        ]
      : [],
  });
});

route('GET', '/orgs/{orgId}/reliability/reviews/{reviewId}', ({ res, orgId, params, correlationId }) => {
  if (params['reviewId'] !== 'rev_2026_q3' || orgId !== 'org_northwind') return problem(res, 404, 'Review not found', correlationId);
  send(res, 200, review(orgId));
});

// ── Commands ─────────────────────────────────────────────────────────────────────────────

interface StoredPreflight {
  result: PreflightResult;
  subject: string;
  orgId: string;
}
const preflights = new Map<string, StoredPreflight>();
const commands = new Map<string, CommandRecord & { orgId: string }>();
const idempotency = new Map<string, string>();

function appendAudit(ctx: Ctx, record: Omit<AuditRecord, 'id' | 'occurredAt' | 'organization' | 'correlationId' | 'integrity' | 'actor'>): void {
  const org = orgById(ctx.orgId)!;
  const idp = IDP_LABEL[ctx.caller.user.idp];
  AUDIT.unshift({
    id: `aud_${randomUUID().slice(0, 8)}`,
    occurredAt: new Date().toISOString(),
    actor: { subject: ctx.caller.user.sub, displayName: ctx.caller.user.name, type: 'human', ...(idp ? { identityProvider: { id: ctx.caller.user.idp, ...idp } } : {}) },
    organization: org,
    correlationId: ctx.correlationId,
    integrity: { state: 'unverified' },
    ...record,
  });
}

route('POST', '/orgs/{orgId}/commands/preflight', async (ctx) => {
  const body = JSON.parse(await readBody(ctx.req)) as { assetId?: string; action?: string; parameters?: Record<string, unknown>; reason?: string; changeTicket?: string };
  const a = assetById(ctx.orgId, body.assetId ?? '');
  if (!a) return problem(ctx.res, 404, 'Asset not found', ctx.correlationId);
  const def = actionsFor(a, ctx.caller).find((d) => d.action === body.action);
  if (!def) return problem(ctx.res, 400, 'Unknown action for this asset', ctx.correlationId);
  if (typeof body.reason !== 'string' || body.reason.trim().length < 10) {
    return problem(ctx.res, 422, 'A reason of at least 10 characters is required', ctx.correlationId);
  }
  const reasons: { code: string; message: string }[] = [];
  let decision: PreflightResult['decision'] = 'permit';
  if (!def.availability.available) {
    decision = 'deny';
    reasons.push({ code: 'rbac', message: def.availability.reason ?? 'Not permitted.' });
  }
  const site = SITES.find((s) => s.id === a.detail.context.site.id);
  if (def.safetyClass !== 'GREEN' && site?.connectivity.state !== 'connected') {
    decision = 'deny';
    reasons.push({ code: 'site_unreachable', message: `Site ${site?.code ?? ''} is ${site?.connectivity.state ?? 'unknown'}; consequential actions require a connected site gateway.` });
  }
  const cap = a.detail.capabilities.find((c) => c.safetyClass === def.safetyClass && c.safetyClass !== 'GREEN');
  if (cap && !cap.siteApproved) {
    decision = 'deny';
    reasons.push({ code: 'capability_not_site_approved', message: `Capability "${cap.label}" is observed and declared but not site-approved.` });
  }
  const params: { label: string; value: string; previousValue?: string }[] = def.parameters.map((p) => ({
    label: p.label,
    value: `${String(body.parameters?.[p.name] ?? '—')}${p.unit ? ` ${p.unit}` : ''}`,
    ...(p.name === 'interval_ms' ? { previousValue: '1000 ms' } : p.name === 'setpoint_bar' ? { previousValue: '150 bar' } : {}),
  }));
  const result: PreflightResult = {
    preflightId: `pf_${randomUUID()}`,
    expiresAt: new Date(Date.now() + 5 * MIN).toISOString(),
    safetyClass: def.safetyClass,
    decision,
    reasons,
    policy: {
      id: def.safetyClass === 'GREEN' ? 'pol_observe' : 'pol_ot_change',
      name: def.safetyClass === 'GREEN' ? 'Observation baseline' : def.safetyClass === 'AMBER' ? 'OT administrative change' : 'OT physical-process write',
      version: '12',
      rule: def.safetyClass === 'GREEN' ? 'green.observe.site_scope' : def.safetyClass === 'AMBER' ? 'amber.change.requires_ticket_and_mfa' : 'red.write.requires_fresh_mfa_and_site_approval',
    },
    target: summary(a),
    effect: { summary: `${def.label} on ${a.detail.tag}. ${def.description}`, parameters: params },
    requestedBy: { subject: ctx.caller.user.sub, displayName: ctx.caller.user.name, type: 'human', identityProvider: { id: ctx.caller.user.idp, ...(IDP_LABEL[ctx.caller.user.idp] ?? { displayName: ctx.caller.user.idp, protocol: 'oidc' as const }) } },
    reason: body.reason.trim(),
    ...(body.changeTicket ? { changeTicket: body.changeTicket } : {}),
    requirements: {
      stepUp: def.safetyClass === 'GREEN' ? { required: false } : { required: true, acr: ACR_MFA, maxAgeSeconds: def.safetyClass === 'RED' ? 300 : 900 },
      changeTicket: def.safetyClass !== 'GREEN',
      secondApprover: def.safetyClass === 'RED',
      typedConfirmation: def.safetyClass === 'RED',
    },
  };
  if (def.safetyClass !== 'GREEN' && !body.changeTicket) {
    result.decision = 'deny';
    result.reasons.push({ code: 'change_ticket_required', message: 'Policy requires an approved change ticket reference.' });
  }
  preflights.set(result.preflightId, { result, subject: ctx.caller.user.sub, orgId: ctx.orgId });
  appendAudit(ctx, {
    site: { id: a.detail.context.site.id, code: a.detail.context.site.code },
    asset: { id: a.detail.id, tag: a.detail.tag },
    action: `${def.action}.preflight`,
    safetyClass: def.safetyClass,
    request: { summary: `Preflight: ${def.label} on ${a.detail.tag}`, digest: `sha256:${hashId(JSON.stringify(body)).toString(16).padStart(64, '0')}` },
    decision: { outcome: result.decision === 'deny' ? 'deny' : 'permit', policy: result.policy!, reasons: result.reasons.map((r) => r.message) },
    result: { status: 'not_executed', detail: 'Preflight evaluation only' },
  });
  send(ctx.res, 200, result);
});

route('POST', '/orgs/{orgId}/commands', async (ctx) => {
  const key = ctx.req.headers['idempotency-key'];
  if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) return problem(ctx.res, 400, 'Idempotency-Key header (UUID) is required', ctx.correlationId);
  const existing = idempotency.get(key);
  if (existing) {
    const rec = commands.get(existing);
    if (rec) return send(ctx.res, 202, rec);
  }
  const body = JSON.parse(await readBody(ctx.req)) as { preflightId?: string; typedConfirmation?: string };
  const stored = preflights.get(body.preflightId ?? '');
  if (!stored || stored.subject !== ctx.caller.user.sub || stored.orgId !== ctx.orgId) {
    return problem(ctx.res, 404, 'Preflight not found for this principal', ctx.correlationId);
  }
  const pf = stored.result;
  if (Date.parse(pf.expiresAt) < Date.now()) return problem(ctx.res, 409, 'Preflight expired', ctx.correlationId, { detail: 'Run the policy check again.' });
  if (pf.decision === 'deny') return problem(ctx.res, 403, 'Denied by policy', ctx.correlationId, { detail: pf.reasons.map((r) => r.message).join(' ') });
  const req = pf.requirements.stepUp;
  if (req.required) {
    const age = Math.floor(Date.now() / 1000) - ctx.caller.authTime;
    if (ctx.caller.acr !== req.acr || (req.maxAgeSeconds !== undefined && age > req.maxAgeSeconds)) {
      return problem(ctx.res, 403, 'Step-up authentication required', ctx.correlationId, { code: 'step_up_required', stepUp: req });
    }
  }
  if (pf.requirements.typedConfirmation && body.typedConfirmation !== pf.target.tag) {
    return problem(ctx.res, 422, 'Typed confirmation does not match target', ctx.correlationId);
  }
  const consequential = pf.safetyClass !== 'GREEN';
  const record: CommandRecord & { orgId: string } = {
    orgId: ctx.orgId,
    id: `cmd_${randomUUID().slice(0, 12)}`,
    state: consequential ? 'rejected' : 'submitted',
    safetyClass: pf.safetyClass,
    action: pf.effect.summary.split(' on ')[0] ?? 'action',
    actionLabel: pf.effect.summary.split(' on ')[0] ?? 'action',
    target: pf.target,
    requestedBy: pf.requestedBy,
    requestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reason: pf.reason,
    correlationId: ctx.correlationId,
    ...(consequential ? { detail: 'Execution disabled in this build: the site gate rejects AMBER and RED operations (ADR 0002). Nothing was executed.' } : {}),
  };
  commands.set(record.id, record);
  idempotency.set(key, record.id);
  preflights.delete(pf.preflightId);
  appendAudit(ctx, {
    site: { id: pf.target.context.site.id, code: pf.target.context.site.code },
    asset: { id: pf.target.id, tag: pf.target.tag },
    action: record.action,
    safetyClass: pf.safetyClass,
    request: { summary: `${pf.effect.summary} Reason: ${pf.reason}`, digest: `sha256:${hashId(pf.preflightId).toString(16).padStart(64, '0')}` },
    decision: { outcome: consequential ? 'deny' : 'permit', ...(pf.policy ? { policy: pf.policy } : {}), reasons: consequential ? ['Site gate rejects consequential operations (phase 0)'] : [] },
    result: { status: consequential ? 'not_executed' : 'pending' },
  });
  if (!consequential) {
    // GREEN observation progresses through states; the UI must not assume success from 202.
    const advance = (state: CommandRecord['state'], delay: number) =>
      setTimeout(() => {
        const r = commands.get(record.id);
        if (r) commands.set(record.id, { ...r, state, updatedAt: new Date().toISOString(), ...(state === 'succeeded' ? { detail: 'Snapshot captured in site-local store.' } : {}) });
      }, delay);
    advance('dispatched', 800);
    advance('acknowledged', 1800);
    advance('succeeded', 3200);
  }
  const { orgId: _o, ...wire } = record;
  send(ctx.res, 202, wire);
});

route('GET', '/orgs/{orgId}/commands/{commandId}', ({ res, orgId, params, correlationId }) => {
  const rec = commands.get(params['commandId'] ?? '');
  if (!rec || rec.orgId !== orgId) return problem(res, 404, 'Command not found', correlationId);
  const { orgId: _o, ...wire } = rec;
  send(res, 200, wire);
});

route('GET', '/orgs/{orgId}/approvals', ({ res, orgId, caller }) => {
  if (orgId !== 'org_northwind' || !hasRole(caller, 'controls-engineer')) return send(res, 200, { items: [] });
  const a = assetById(orgId, 'ast_plc203')!;
  send(res, 200, {
    items: [
      {
        id: 'cmd_pending_1',
        state: 'pending_approval',
        safetyClass: 'AMBER',
        action: 'asset.change_configuration',
        actionLabel: 'Change OPC UA publishing interval',
        target: summary(a),
        requestedBy: { subject: 'u_keller', displayName: 'A. Keller', type: 'human' },
        requestedAt: iso(-18 * MIN),
        updatedAt: iso(-18 * MIN),
        reason: 'Reduce OPC UA load during PLC firmware diagnostics (CHG-20931).',
        correlationId: 'corr-pending-1',
      },
    ],
  });
});

// ── Audit ────────────────────────────────────────────────────────────────────────────────

route('GET', '/orgs/{orgId}/audit', ({ res, url, orgId, caller }) => {
  const sp = url.searchParams;
  let items = AUDIT.filter((r) => r.organization.id === orgId);
  const eq = (key: string, get: (r: AuditRecord) => string | undefined) => {
    const v = sp.get(key);
    if (v) items = items.filter((r) => get(r) === v);
  };
  eq('actor', (r) => r.actor.subject);
  eq('assetId', (r) => r.asset?.id);
  eq('siteId', (r) => r.site?.id);
  eq('action', (r) => r.action);
  eq('decision', (r) => r.decision.outcome);
  eq('correlationId', (r) => r.correlationId);
  const from = Date.parse(sp.get('from') ?? '');
  const to = Date.parse(sp.get('to') ?? '');
  if (!Number.isNaN(from)) items = items.filter((r) => Date.parse(r.occurredAt) >= from);
  if (!Number.isNaN(to)) items = items.filter((r) => Date.parse(r.occurredAt) <= to);
  const q = sp.get('q')?.toLowerCase();
  if (q) items = items.filter((r) => [r.request.summary, r.actor.displayName, r.asset?.tag, r.action, r.correlationId].some((s) => s?.toLowerCase().includes(q)));
  const canExport = hasRole(caller, 'auditor') || hasRole(caller, 'org-admin');
  send(res, 200, {
    ...paginate(items, url),
    exportPermitted: canExport ? { action: 'audit.export', available: true } : { action: 'audit.export', available: false, reason: 'Export requires the auditor or org-admin role.' },
  });
});

route('POST', '/orgs/{orgId}/audit/exports', async (ctx) => {
  await readBody(ctx.req);
  if (!hasRole(ctx.caller, 'auditor') && !hasRole(ctx.caller, 'org-admin')) {
    return problem(ctx.res, 403, 'Export not permitted', ctx.correlationId, { detail: 'Export requires the auditor or org-admin role.' });
  }
  send(ctx.res, 202, { id: `exp_${randomUUID().slice(0, 8)}`, state: 'pending_approval', detail: 'Exports over 10,000 records need approval by the data protection officer (policy AUD-EXP-2).' });
});

// ── AI ───────────────────────────────────────────────────────────────────────────────────

const egress: AiEgressRecord[] = [];

route('GET', '/orgs/{orgId}/ai/providers', ({ res, orgId }) => send(res, 200, { items: orgId === 'org_northwind' ? AI_PROVIDERS : [] }));
route('GET', '/orgs/{orgId}/ai/policies', ({ res, orgId }) => send(res, 200, { items: orgId === 'org_northwind' ? AI_POLICIES : [] }));
route('GET', '/orgs/{orgId}/ai/egress', ({ res, url }) => send(res, 200, paginate(egress, url)));

route('PUT', '/orgs/{orgId}/ai/policies/{policyId}', async (ctx) => {
  if (!hasRole(ctx.caller, 'org-admin')) return problem(ctx.res, 403, 'Not permitted', ctx.correlationId, { detail: 'Changing AI data policy requires the org-admin role.' });
  if (ctx.caller.acr !== ACR_MFA || Date.now() / 1000 - ctx.caller.authTime > 900) {
    return problem(ctx.res, 403, 'Step-up authentication required', ctx.correlationId, { code: 'step_up_required', stepUp: { required: true, acr: ACR_MFA, maxAgeSeconds: 900 } });
  }
  const idx = AI_POLICIES.findIndex((p) => p.id === ctx.params['policyId']);
  const current = AI_POLICIES[idx];
  if (!current) return problem(ctx.res, 404, 'Policy not found', ctx.correlationId);
  if (ctx.req.headers['if-match'] !== current.version) return problem(ctx.res, 412, 'Policy changed since it was loaded', ctx.correlationId);
  const update = JSON.parse(await readBody(ctx.req)) as AiDataPolicyUpdate;
  const conflict = update.allowedCategories.filter((c) => update.prohibitedCategories.includes(c));
  if (conflict.length > 0) return problem(ctx.res, 422, 'Categories cannot be both allowed and prohibited', ctx.correlationId, { detail: conflict.join(', ') });
  const next = { ...current, ...update, version: String(Number(current.version) + 1), updatedAt: new Date().toISOString(), updatedBy: { subject: ctx.caller.user.sub, displayName: ctx.caller.user.name, type: 'human' as const } };
  AI_POLICIES[idx] = next;
  appendAudit(ctx, {
    action: 'ai.policy.update',
    safetyClass: 'AMBER',
    request: { summary: `Updated AI data policy ${current.id} v${current.version} → v${next.version}`, digest: `sha256:${hashId(JSON.stringify(update)).toString(16).padStart(64, '0')}` },
    decision: { outcome: 'permit', policy: { id: 'pol_ai_admin', name: 'AI governance administration', version: '2' }, reasons: [] },
    result: { status: 'success' },
  });
  send(ctx.res, 200, next);
});

route('POST', '/orgs/{orgId}/ai/assistant/turns', async (ctx) => {
  const body = JSON.parse(await readBody(ctx.req)) as { message?: string; providerId?: string; conversationId?: string };
  const provider = AI_PROVIDERS.find((p) => p.id === (body.providerId ?? 'aip_ollama'));
  if (!provider) return problem(ctx.res, 404, 'Provider not configured', ctx.correlationId);
  if (provider.status !== 'enabled') return problem(ctx.res, 403, 'Provider not approved for use', ctx.correlationId, { detail: `${provider.displayName} is ${provider.status.replace('_', ' ')}.` });
  const message = (body.message ?? '').slice(0, 4000);
  const tagMatch = /\b([A-Z]{2,4}-[A-Z0-9-]{2,12})\b/.exec(message.toUpperCase());
  const asset = tagMatch ? ASSETS.find((a) => a.orgId === ctx.orgId && a.detail.tag === tagMatch[1]) : undefined;
  const wantsMetric = /mtbf|mttr|availability|downtime|failure/i.exec(message);
  const blocks: AssistantTurn['blocks'] = [];
  const categories: AssistantTurn['egress']['categories'] = [];
  if (asset && wantsMetric) {
    categories.push('reliability_metrics', 'asset_inventory');
    const key = wantsMetric[0].toLowerCase();
    const days = /last year|12 months|annual/i.test(message) ? 'P1Y' : /quarter|3 months/i.test(message) ? 'P3M' : 'P1Y';
    blocks.push({
      type: 'tool_result',
      tool: 'analytics.get_reliability',
      status: 'ok',
      summary: `Called analytics service: reliability report for ${asset.detail.tag}, period ${days}.`,
      provenance: [
        { kind: 'analytics', id: `rel_${asset.detail.id}_${days}`, label: `Reliability report ${asset.detail.tag} (${days}), r-reliability/core 1.4.0`, assetId: asset.detail.id },
        { kind: 'asset', id: asset.detail.id, label: `${asset.detail.tag} — ${asset.detail.name}`, assetId: asset.detail.id },
      ],
    });
    blocks.push({
      type: 'text',
      text: `The analytics service reports ${key.toUpperCase()} for ${asset.detail.tag} over the requested period. Open the linked reliability report for the value, its 95 % confidence interval, sample size and method. I have not calculated or estimated this figure myself.\n\n(Development fixture: no language model is running. This response is scripted to demonstrate tool use and provenance.)`,
    });
  } else if (tagMatch && !asset) {
    blocks.push({ type: 'tool_result', tool: 'assets.lookup', status: 'no_data', summary: `No asset tagged ${tagMatch[1]} in this organization.`, provenance: [] });
    blocks.push({ type: 'text', text: `I could not find an asset tagged ${tagMatch[1]} that you have access to, so I can't answer that.` });
  } else {
    blocks.push({
      type: 'text',
      text: 'Development fixture: no language model is running. Ask a reliability question naming an asset tag, for example "What was PLC-203\'s MTBF last year?", to see how answers are sourced from the analytics service with provenance.',
    });
  }
  const external = provider.locality !== 'on_premises';
  if (categories.length > 0) {
    egress.unshift({
      id: `egr_${randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      providerId: provider.id,
      locality: provider.locality,
      categories,
      redactedFieldCount: external ? 2 : 0,
      bytes: 1840,
      decision: 'allowed',
      actor: { subject: ctx.caller.user.sub, displayName: ctx.caller.user.name, type: 'human' },
    });
  }
  const turn: AssistantTurn = {
    conversationId: body.conversationId ?? `conv_${randomUUID().slice(0, 8)}`,
    id: `turn_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    blocks,
    provider: { id: provider.id, displayName: provider.displayName, model: provider.model, locality: provider.locality },
    egress: { external, categories, redactedFieldCount: external && categories.length > 0 ? 2 : 0 },
  };
  send(ctx.res, 200, turn);
});

route('GET', '/orgs/{orgId}/domains', ({ res, orgId }) => send(res, 200, { items: orgId === 'org_northwind' ? DOMAINS : [] }));

// ── Dispatcher ───────────────────────────────────────────────────────────────────────────

export async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  caller: AuthenticatedCaller,
  correlationId: string,
): Promise<void> {
  const path = url.pathname.replace(/^\/api\/v0/, '');
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1] ?? '');
    });
    const orgId = params['orgId'] ?? '';
    if (path.startsWith('/orgs/') && !caller.user.orgs.includes(orgId)) {
      problem(res, 403, 'Organization outside your scope', correlationId, { code: 'forbidden_scope' });
      return;
    }
    await r.handler({ req, res, url, params, caller, orgId, correlationId });
    return;
  }
  problem(res, 404, 'No such endpoint', correlationId);
}
