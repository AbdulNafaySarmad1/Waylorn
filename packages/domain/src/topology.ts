import type { AssetKind, RelationType, TopologyEdge, TopologyGraph, TopologyNode } from '@waylorn/contracts';

/** The client never holds more nodes than this (ADR 0012). */
export const TOPOLOGY_NODE_BUDGET = 300;

export const RELATION_LABEL: Readonly<Record<RelationType, string>> = {
  CONTROLS: 'controls',
  CONNECTED_TO: 'connected to',
  DEPENDS_ON: 'depends on',
  PROGRAMMED_BY: 'programmed by',
  MONITORED_BY: 'monitored by',
  HOSTED_ON: 'hosted on',
  SENDS_DATA_TO: 'sends data to',
  REPRESENTED_BY: 'represented by',
  PROTECTED_BY: 'protected by',
};

/** Relations traversed for dependency tracing / impact analysis. */
export const DEPENDENCY_RELATIONS: readonly RelationType[] = ['DEPENDS_ON', 'CONTROLS', 'HOSTED_ON', 'SENDS_DATA_TO'];

/**
 * Lanes follow the Purdue reference model so plant engineers read the graph the way they
 * already reason about levels and conduits.
 */
export const LANES = [
  { id: 'cloud', label: 'Cloud & enterprise (L4–5)' },
  { id: 'dmz', label: 'Industrial DMZ (L3.5)' },
  { id: 'operations', label: 'Site operations (L3)' },
  { id: 'network', label: 'Network' },
  { id: 'supervisory', label: 'Supervisory (L2)' },
  { id: 'control', label: 'Control (L1)' },
  { id: 'process', label: 'Process (L0)' },
] as const;

export type LaneId = (typeof LANES)[number]['id'];

const ROLE_LANE: Readonly<Record<string, LaneId>> = {
  cloud_service: 'cloud',
  firewall: 'dmz',
  data_diode: 'dmz',
  jump_host: 'dmz',
  edge_server: 'operations',
  historian: 'operations',
  application: 'operations',
  storage: 'operations',
  switch: 'network',
  router: 'network',
  serial_server: 'network',
  wireless_ap: 'network',
  hmi: 'supervisory',
  gateway: 'supervisory',
  scada: 'supervisory',
  plc: 'control',
  safety_controller: 'control',
  machine: 'process',
  sensor: 'process',
  drive: 'process',
  robot: 'process',
};

const KIND_LANE: Readonly<Record<AssetKind, LaneId>> = {
  CloudResource: 'cloud',
  SecurityAsset: 'dmz',
  ComputeAsset: 'operations',
  ApplicationAsset: 'operations',
  StorageAsset: 'operations',
  NetworkAsset: 'network',
  IndustrialAsset: 'control',
};

export function laneFor(node: Pick<TopologyNode, 'kind' | 'role'>): LaneId {
  if (node.role !== undefined) {
    const byRole = ROLE_LANE[node.role];
    if (byRole !== undefined) return byRole;
  }
  return KIND_LANE[node.kind];
}

export interface PositionedNode {
  readonly node: TopologyNode;
  readonly lane: LaneId;
  readonly x: number;
  readonly y: number;
}

export interface LaneBand {
  readonly id: LaneId;
  readonly label: string;
  readonly y: number;
}

export interface TopologyLayout {
  readonly nodes: readonly PositionedNode[];
  readonly lanes: readonly LaneBand[];
  readonly width: number;
  readonly height: number;
}

export interface LayoutOptions {
  readonly columnWidth: number;
  readonly laneHeight: number;
  readonly sweeps: number;
}

const DEFAULT_LAYOUT: LayoutOptions = { columnWidth: 168, laneHeight: 112, sweeps: 4 };

/**
 * Deterministic layered layout: lanes by Purdue level, order within a lane by barycentre
 * sweeps to reduce crossings, ties broken by tag. Same input always yields the same
 * positions, which preserves operators' spatial memory across refreshes.
 */
export function layoutTopology(
  nodes: readonly TopologyNode[],
  edges: readonly TopologyEdge[],
  options: Partial<LayoutOptions> = {},
): TopologyLayout {
  const opts = { ...DEFAULT_LAYOUT, ...options };
  const laneOf = new Map<string, LaneId>();
  const byLane = new Map<LaneId, TopologyNode[]>();
  for (const node of nodes) {
    const lane = laneFor(node);
    laneOf.set(node.id, lane);
    const list = byLane.get(lane);
    if (list) list.push(node);
    else byLane.set(lane, [node]);
  }

  const activeLanes = LANES.filter((l) => byLane.has(l.id));
  const order = new Map<LaneId, TopologyNode[]>();
  for (const lane of activeLanes) {
    const list = [...(byLane.get(lane.id) ?? [])];
    list.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || compareText(a.tag, b.tag) || compareText(a.id, b.id));
    order.set(lane.id, list);
  }

  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    if (!laneOf.has(edge.source) || !laneOf.has(edge.target)) continue;
    pushTo(neighbours, edge.source, edge.target);
    pushTo(neighbours, edge.target, edge.source);
  }

  const index = new Map<string, number>();
  const reindex = (): void => {
    for (const list of order.values()) list.forEach((n, i) => index.set(n.id, i));
  };
  reindex();

  const laneIds = activeLanes.map((l) => l.id);
  for (let sweep = 0; sweep < opts.sweeps; sweep += 1) {
    const sequence = sweep % 2 === 0 ? laneIds : [...laneIds].reverse();
    for (const laneId of sequence) {
      const list = order.get(laneId);
      if (!list || list.length < 2) continue;
      const bary = new Map<string, number>();
      for (const n of list) {
        const adj = (neighbours.get(n.id) ?? []).filter((id) => laneOf.get(id) !== laneId);
        const current = index.get(n.id) ?? 0;
        if (adj.length === 0) {
          bary.set(n.id, current);
          continue;
        }
        let sum = 0;
        for (const id of adj) sum += index.get(id) ?? 0;
        bary.set(n.id, sum / adj.length);
      }
      list.sort(
        (a, b) =>
          (bary.get(a.id) ?? 0) - (bary.get(b.id) ?? 0) || compareText(a.tag, b.tag) || compareText(a.id, b.id),
      );
      list.forEach((n, i) => index.set(n.id, i));
    }
  }

  const widest = Math.max(1, ...[...order.values()].map((l) => l.length));
  const width = widest * opts.columnWidth;
  const positioned: PositionedNode[] = [];
  const lanes: LaneBand[] = [];
  activeLanes.forEach((lane, laneIndex) => {
    const y = laneIndex * opts.laneHeight + opts.laneHeight / 2;
    lanes.push({ id: lane.id, label: lane.label, y });
    const list = order.get(lane.id) ?? [];
    const offset = ((widest - list.length) * opts.columnWidth) / 2;
    list.forEach((node, i) => {
      positioned.push({ node, lane: lane.id, x: offset + i * opts.columnWidth + opts.columnWidth / 2, y });
    });
  });

  return { nodes: positioned, lanes, width, height: activeLanes.length * opts.laneHeight };
}

export type MergeResult =
  | { readonly ok: true; readonly graph: TopologyGraph }
  | { readonly ok: false; readonly reason: 'budget_exceeded'; readonly wouldHold: number };

/**
 * Progressive expansion: merge a newly fetched neighbourhood into the current view,
 * refusing if the result would exceed the client budget.
 */
export function mergeNeighbourhood(
  current: TopologyGraph,
  incoming: TopologyGraph,
  budget = TOPOLOGY_NODE_BUDGET,
): MergeResult {
  const nodes = new Map(current.nodes.map((n) => [n.id, n]));
  for (const n of incoming.nodes) {
    const existing = nodes.get(n.id);
    // Keep the smaller distance from the original focus.
    if (!existing) nodes.set(n.id, { ...n, distance: (n.distance ?? 0) + (nodeDistance(current, incoming.focusId) ?? 0) });
    else nodes.set(n.id, { ...n, distance: existing.distance ?? n.distance ?? 0 });
  }
  if (nodes.size > budget) return { ok: false, reason: 'budget_exceeded', wouldHold: nodes.size };

  const edges = new Map(current.edges.map((e) => [e.id, e]));
  for (const e of incoming.edges) edges.set(e.id, e);

  const clusters = new Map(current.clusters.map((c) => [c.id, c]));
  for (const c of incoming.clusters) clusters.set(c.id, c);
  // An expanded node's clusters are superseded by the fetched neighbourhood.
  for (const [id, c] of clusters) if (c.attachedTo === incoming.focusId && !incoming.clusters.includes(c)) clusters.delete(id);

  return {
    ok: true,
    graph: {
      ...current,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      clusters: [...clusters.values()],
      truncated: current.truncated || incoming.truncated,
      computedAt: incoming.computedAt,
    },
  };
}

function nodeDistance(graph: TopologyGraph, id: string): number | undefined {
  return graph.nodes.find((n) => n.id === id)?.distance;
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Edge IDs on the paths returned by an impact analysis, for highlighting. */
export function highlightedEdges(paths: readonly (readonly string[])[]): ReadonlySet<string> {
  const set = new Set<string>();
  for (const p of paths) for (const id of p) set.add(id);
  return set;
}
