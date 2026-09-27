import { describe, expect, it } from 'vitest';
import type { TopologyEdge, TopologyGraph, TopologyNode } from '@waylorn/contracts';
import { laneFor, layoutTopology, mergeNeighbourhood, TOPOLOGY_NODE_BUDGET } from '../src/topology';

const node = (id: string, role: string, kind: TopologyNode['kind'] = 'IndustrialAsset', distance = 1): TopologyNode => ({
  id,
  kind,
  role,
  name: id,
  tag: id.toUpperCase(),
  health: 'ok',
  distance,
});
const edge = (source: string, target: string): TopologyEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  relation: 'CONTROLS',
  provenance: 'declared',
});

describe('laneFor', () => {
  it('places roles on Purdue lanes', () => {
    expect(laneFor({ kind: 'IndustrialAsset', role: 'plc' })).toBe('control');
    expect(laneFor({ kind: 'IndustrialAsset', role: 'hmi' })).toBe('supervisory');
    expect(laneFor({ kind: 'IndustrialAsset', role: 'sensor' })).toBe('process');
    expect(laneFor({ kind: 'CloudResource' })).toBe('cloud');
    expect(laneFor({ kind: 'NetworkAsset', role: 'unmapped' })).toBe('network');
  });
});

describe('layoutTopology', () => {
  const nodes = [node('plc', 'plc', 'IndustrialAsset', 0), node('m2', 'machine'), node('m1', 'machine'), node('hmi', 'hmi')];
  const edges = [edge('plc', 'm1'), edge('plc', 'm2'), edge('hmi', 'plc')];

  it('is deterministic regardless of input order', () => {
    const a = layoutTopology(nodes, edges);
    const b = layoutTopology([...nodes].reverse(), [...edges].reverse());
    const pos = (l: ReturnType<typeof layoutTopology>) => l.nodes.map((n) => `${n.node.id}:${n.x},${n.y}`).sort();
    expect(pos(a)).toEqual(pos(b));
  });

  it('orders lanes top to bottom by Purdue level', () => {
    const layout = layoutTopology(nodes, edges);
    const y = (id: string) => layout.nodes.find((n) => n.node.id === id)?.y ?? -1;
    expect(y('hmi')).toBeLessThan(y('plc'));
    expect(y('plc')).toBeLessThan(y('m1'));
    expect(layout.lanes.map((l) => l.id)).toEqual(['supervisory', 'control', 'process']);
  });

  it('lays out 5,000 nodes within a performance budget', () => {
    const many: TopologyNode[] = [];
    const manyEdges: TopologyEdge[] = [];
    for (let i = 0; i < 50; i += 1) {
      many.push(node(`plc${i}`, 'plc'));
      for (let j = 0; j < 99; j += 1) {
        many.push(node(`s${i}_${j}`, 'sensor'));
        manyEdges.push(edge(`plc${i}`, `s${i}_${j}`));
      }
    }
    const start = performance.now();
    const layout = layoutTopology(many, manyEdges);
    expect(layout.nodes).toHaveLength(5_000);
    expect(performance.now() - start).toBeLessThan(1_000);
  });
});

describe('mergeNeighbourhood', () => {
  const graph = (focusId: string, ids: string[]): TopologyGraph => ({
    focusId,
    depth: 1,
    nodes: ids.map((id) => node(id, 'sensor')),
    edges: [],
    clusters: [],
    truncated: false,
    computedAt: '2026-09-27T12:00:00Z',
  });

  it('merges without duplicates', () => {
    const r = mergeNeighbourhood(graph('a', ['a', 'b']), graph('b', ['b', 'c']));
    expect(r.ok && r.graph.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('refuses to exceed the node budget', () => {
    const big = graph('a', Array.from({ length: TOPOLOGY_NODE_BUDGET }, (_, i) => `n${i}`));
    const r = mergeNeighbourhood(big, graph('n0', ['extra']));
    expect(r).toEqual({ ok: false, reason: 'budget_exceeded', wouldHold: TOPOLOGY_NODE_BUDGET + 1 });
  });
});
