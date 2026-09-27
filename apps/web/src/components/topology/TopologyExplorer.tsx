'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { TopologyEdge, TopologyGraph } from '@waylorn/contracts';
import {
  ASSET_KIND_LABEL,
  highlightedEdges,
  humanizeToken,
  layoutTopology,
  mergeNeighbourhood,
  orgPath,
  presentProblem,
  RELATION_LABEL,
  TOPOLOGY_NODE_BUDGET,
  type PositionedNode,
  type ProblemPresentation,
} from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { Glyph } from '@/components/ui/Glyph';
import { DegradedNotice, ErrorState } from '@/components/ui/States';
import { HealthStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { bff } from '@/lib/bff';
import styles from './Topology.module.css';

const NODE_W = 144;
const NODE_H = 40;
const LANE_LABEL_W = 170;

interface Impact {
  readonly direction: 'upstream' | 'downstream';
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
  readonly rootId: string;
}

interface View {
  readonly k: number;
  readonly x: number;
  readonly y: number;
}

const HEALTH_GLYPH = { ok: 'check', warning: 'triangle', fault: 'cross', unknown: 'question' } as const;

/**
 * Bounded topology exploration (ADR 0011). Never holds more than the client node budget;
 * large neighbourhoods arrive as clusters. The table view is the accessible equivalent.
 * Callers key this component by focus so a new focus starts from fresh state.
 */
export function TopologyExplorer({
  orgId,
  orgSlug,
  initial,
  compact = false,
}: {
  orgId: string;
  orgSlug: string;
  initial: TopologyGraph;
  compact?: boolean;
}) {
  const [graph, setGraph] = useState(initial);
  const [selected, setSelected] = useState<string>(initial.focusId);
  const [mode, setMode] = useState<'graph' | 'table'>('graph');
  const [impact, setImpact] = useState<Impact | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const canvas = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | undefined>(undefined);

  const layout = useMemo(() => layoutTopology(graph.nodes, graph.edges), [graph.nodes, graph.edges]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.node.id, n])), [layout.nodes]);
  const worldW = layout.width + LANE_LABEL_W;
  const worldH = layout.height;

  const fit = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const k = Math.min(1.4, Math.max(0.25, Math.min(width / (worldW + 40), height / (worldH + 40))));
    setView({ k, x: (width - worldW * k) / 2, y: (height - worldH * k) / 2 });
  }, [worldW, worldH]);

  // Initial view: readable scale centred on the focus asset; "Fit" shows everything.
  const centreOnFocus = useCallback(() => {
    const el = canvas.current;
    const focus = byId.get(initial.focusId);
    if (!el || !focus) return;
    const { width, height } = el.getBoundingClientRect();
    const k = Math.max(0.85, Math.min(1.2, Math.min(width / (worldW + 40), height / (worldH + 40))));
    setView({ k, x: width / 2 - (focus.x + LANE_LABEL_W) * k, y: height / 2 - focus.y * k });
  }, [byId, initial.focusId, worldW, worldH]);

  const centred = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (centred.current === initial.focusId) return;
    centred.current = initial.focusId;
    centreOnFocus();
  }, [centreOnFocus, initial.focusId]);

  // Wheel zoom needs a non-passive listener to prevent page scroll while over the canvas.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(3, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (factor: number) => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.2, v.k * factor)) }));

  const expand = async (id: string) => {
    setBusy(true);
    setMessage(undefined);
    const { data, error, response } = await bff().GET('/orgs/{orgId}/topology/neighborhood', {
      params: { path: { orgId }, query: { focus: id, depth: 1, nodeLimit: 100 } },
    });
    setBusy(false);
    if (!data) {
      setProblem(presentProblem(error, response.status));
      return;
    }
    const merged = mergeNeighbourhood(graph, data);
    if (!merged.ok) {
      setMessage(
        `Expanding would show ${merged.wouldHold} assets; the limit is ${TOPOLOGY_NODE_BUDGET}. Focus on this asset or filter relations instead.`,
      );
      return;
    }
    setGraph(merged.graph);
  };

  const showImpact = async (id: string, direction: 'upstream' | 'downstream') => {
    setBusy(true);
    const { data, error, response } = await bff().GET('/orgs/{orgId}/topology/impact', {
      params: { path: { orgId }, query: { assetId: id, direction } },
    });
    setBusy(false);
    if (!data) {
      setProblem(presentProblem(error, response.status));
      return;
    }
    const nodes = new Set([id, ...data.affected.map((a) => a.node.id)]);
    const missing = data.affected.filter((a) => !byId.has(a.node.id)).length;
    setImpact({ direction, rootId: id, nodes, edges: highlightedEdges(data.affected.map((a) => a.path)) });
    setMessage(
      `${data.affected.length} asset(s) ${direction === 'downstream' ? 'affected if this fails' : 'this depends on'}` +
        (missing > 0 ? `; ${missing} are outside the current view (see the Dependencies view for the full list).` : '.'),
    );
  };

  const move = (from: PositionedNode, key: string): PositionedNode | undefined => {
    const candidates = layout.nodes.filter((n) => {
      if (key === 'ArrowLeft') return n.y === from.y && n.x < from.x;
      if (key === 'ArrowRight') return n.y === from.y && n.x > from.x;
      if (key === 'ArrowUp') return n.y < from.y;
      return n.y > from.y;
    });
    let best: PositionedNode | undefined;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c.y - from.y) * 4 + Math.abs(c.x - from.x);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, n: PositionedNode) => {
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const next = move(n, e.key);
      if (next) {
        setSelected(next.node.id);
        requestAnimationFrame(() => svg.current?.querySelector<SVGGElement>(`[data-node="${CSS.escape(next.node.id)}"]`)?.focus());
      }
    }
  };

  const sel = byId.get(selected)?.node ?? graph.nodes.find((n) => n.id === selected);
  const selEdges = graph.edges.filter((e) => e.source === selected || e.target === selected);
  const selClusters = graph.clusters.filter((c) => c.attachedTo === selected);
  const tagOf = (id: string) => byId.get(id)?.node.tag ?? id;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        <span role="group" aria-label="View" style={{ display: 'flex', gap: 4 }}>
          <Button small variant={mode === 'graph' ? 'primary' : 'default'} aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>
            Graph
          </Button>
          <Button small variant={mode === 'table' ? 'primary' : 'default'} aria-pressed={mode === 'table'} onClick={() => setMode('table')}>
            Table
          </Button>
        </span>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }} aria-live="polite">
          {graph.nodes.length} assets · {graph.edges.length} relations
          {graph.clusters.length > 0 ? ` · ${graph.clusters.reduce((s, c) => s + c.memberCount, 0)} more in ${graph.clusters.length} clusters` : ''}
          {graph.truncated ? ' · bounded by node limit' : ''}
        </span>
        {impact ? (
          <Button small onClick={() => { setImpact(undefined); setMessage(undefined); }}>
            Clear impact highlight
          </Button>
        ) : null}
      </div>
      {problem ? <ErrorState problem={problem} /> : null}

      {mode === 'table' ? (
        <>
          <DataTable label="Relations" caption="Dashed/“discovered” relations were observed on the network and have not been reviewed.">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Relation</th>
                <th scope="col">Target</th>
                <th scope="col">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {graph.edges.map((e) => (
                <tr key={e.id} aria-selected={impact?.edges.has(e.id) ? true : undefined}>
                  <td>
                    <Link href={orgPath(orgSlug, 'assets', e.source)} className="mono">{tagOf(e.source)}</Link>
                  </td>
                  <td>{RELATION_LABEL[e.relation]}</td>
                  <td>
                    <Link href={orgPath(orgSlug, 'assets', e.target)} className="mono">{tagOf(e.target)}</Link>
                  </td>
                  <td>{humanizeToken(e.provenance)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {graph.clusters.length > 0 ? (
            <DataTable label="Clusters">
              <thead>
                <tr>
                  <th scope="col">Attached to</th>
                  <th scope="col">Relation</th>
                  <th scope="col">Cluster</th>
                  <th scope="col" className={tableStyles.num}>Faults</th>
                  <th scope="col" className={tableStyles.num}>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {graph.clusters.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{tagOf(c.attachedTo)}</td>
                    <td>{RELATION_LABEL[c.relation]}</td>
                    <td>{c.label}</td>
                    <td className={tableStyles.num}>{c.healthCounts?.fault ?? '—'}</td>
                    <td className={tableStyles.num}>{c.healthCounts?.warning ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </>
      ) : (
        <div className={`${styles.explorer} ${compact ? styles.compact : ''}`}>
          <div className={styles.canvasWrap} ref={canvas}>
            <svg
              ref={svg}
              className={styles.svg}
              role="application"
              aria-roledescription="topology graph"
              aria-label={`Topology around ${tagOf(graph.focusId)}. Use Tab to reach the selected asset and arrow keys to move between assets.`}
              onPointerDown={(e) => {
                if ((e.target as Element).closest('[data-node]')) return;
                drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
              }}
              onPointerUp={() => {
                drag.current = undefined;
              }}
            >
              <defs>
                <marker id="topo-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 8 4 0 8Z" fill="var(--border-strong)" />
                </marker>
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {layout.lanes.map((lane, i) => (
                  <g key={lane.id}>
                    <rect className={i % 2 === 0 ? styles.laneBand : styles.laneBandAlt} x={0} y={lane.y - 56} width={worldW} height={112} />
                    <text className={styles.laneLabel} x={10} y={lane.y + 4}>
                      {lane.label}
                    </text>
                  </g>
                ))}
                <g transform={`translate(${LANE_LABEL_W} 0)`}>
                  {graph.edges.map((e: TopologyEdge) => {
                    const a = byId.get(e.source);
                    const b = byId.get(e.target);
                    if (!a || !b) return null;
                    const hi = impact?.edges.has(e.id) ?? false;
                    const dim = impact !== undefined && !hi;
                    const dy = b.y === a.y ? 0 : b.y > a.y ? NODE_H / 2 : -NODE_H / 2;
                    return (
                      <line
                        key={e.id}
                        className={`${styles.edge} ${e.provenance === 'discovered' ? styles.edgeDiscovered : ''} ${hi ? styles.edgeHighlight : ''} ${dim ? styles.edgeDim : ''}`}
                        x1={a.x}
                        y1={a.y + dy}
                        x2={b.x}
                        y2={b.y - dy}
                        markerEnd="url(#topo-arrow)"
                      >
                        <title>{`${a.node.tag} ${RELATION_LABEL[e.relation]} ${b.node.tag} (${e.provenance})`}</title>
                      </line>
                    );
                  })}
                  {layout.nodes.map((p) => {
                    const n = p.node;
                    const clusters = graph.clusters.filter((c) => c.attachedTo === n.id);
                    const dim = impact !== undefined && !impact.nodes.has(n.id);
                    const cls = [
                      styles.node,
                      n.id === selected ? styles.nodeSelected : '',
                      n.id === graph.focusId ? styles.nodeFocus : '',
                      n.health === 'fault' ? styles.nodeFault : n.health === 'warning' ? styles.nodeWarning : '',
                      dim ? styles.nodeDim : '',
                    ].join(' ');
                    return (
                      <g
                        key={n.id}
                        data-node={n.id}
                        className={cls}
                        transform={`translate(${p.x - NODE_W / 2} ${p.y - NODE_H / 2})`}
                        role="button"
                        tabIndex={n.id === selected ? 0 : -1}
                        aria-pressed={n.id === selected}
                        aria-label={`${n.tag}, ${n.name}, ${ASSET_KIND_LABEL[n.kind]}, health ${n.health}${n.hiddenNeighborCount ? `, ${n.hiddenNeighborCount} more connections` : ''}`}
                        onClick={() => setSelected(n.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(n.id);
                          } else onNodeKey(e, p);
                        }}
                        onDoubleClick={() => void expand(n.id)}
                      >
                        <rect width={NODE_W} height={NODE_H} rx={2} />
                        <g transform="translate(8 9)" style={{ color: n.health === 'ok' ? 'var(--status-ok)' : n.health === 'unknown' ? 'var(--status-unknown)' : n.health === 'fault' ? 'var(--status-fault)' : 'var(--status-warning)' }}>
                          <Glyph shape={HEALTH_GLYPH[n.health]} size={11} />
                        </g>
                        <text x={24} y={17} className="mono">
                          {n.tag.length > 15 ? `${n.tag.slice(0, 14)}…` : n.tag}
                        </text>
                        <text x={24} y={31} className={styles.role}>
                          {humanizeToken(n.role ?? n.kind)}
                          {n.hiddenNeighborCount ? ` · +${n.hiddenNeighborCount}` : ''}
                        </text>
                        {clusters.map((c, i) => (
                          <g key={c.id} className={styles.cluster} transform={`translate(${6 + i * 70} ${NODE_H + 4})`}>
                            <rect width={66} height={14} rx={2} />
                            <text x={4} y={10}>
                              {c.label.length > 12 ? `${c.label.slice(0, 11)}…` : c.label}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
            <div className={styles.toolbar}>
              <Button small onClick={() => zoom(1.2)} aria-label="Zoom in">+</Button>
              <Button small onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</Button>
              <Button small onClick={fit}>Fit</Button>
            </div>
            {message ? (
              <div className={styles.message}>
                <DegradedNotice>{message}</DegradedNotice>
              </div>
            ) : null}
          </div>
          <aside className={styles.panel} aria-label="Selected asset">
            {sel ? (
              <>
                <div>
                  <h3 className="mono">{sel.tag}</h3>
                  <div>{sel.name}</div>
                  <div className="muted">
                    {ASSET_KIND_LABEL[sel.kind]}
                    {sel.role ? ` · ${humanizeToken(sel.role)}` : ''}
                  </div>
                  <div className="muted">{[sel.siteCode, sel.zoneName, sel.lineName].filter(Boolean).join(' › ')}</div>
                  <div style={{ marginTop: 4 }}>
                    <HealthStatus state={sel.health} />
                  </div>
                </div>
                <div className={styles.buttons}>
                  <Link href={orgPath(orgSlug, 'assets', sel.id)}>Open asset</Link>
                  {sel.id !== graph.focusId ? <Link href={`${orgPath(orgSlug, 'topology')}?focus=${encodeURIComponent(sel.id)}`}>Focus here</Link> : null}
                </div>
                <div className={styles.buttons}>
                  <Button small disabled={busy} onClick={() => void expand(sel.id)}>
                    Expand neighbours
                  </Button>
                  <Button small disabled={busy} onClick={() => void showImpact(sel.id, 'downstream')}>
                    Impact if it fails
                  </Button>
                  <Button small disabled={busy} onClick={() => void showImpact(sel.id, 'upstream')}>
                    What it depends on
                  </Button>
                </div>
                <div>
                  <strong>Relations in view</strong>
                  <ul className={styles.relList}>
                    {selEdges.map((e) => (
                      <li key={e.id}>
                        {e.source === sel.id ? (
                          <>
                            {RELATION_LABEL[e.relation]} <span className="mono">{tagOf(e.target)}</span>
                          </>
                        ) : (
                          <>
                            <span className="mono">{tagOf(e.source)}</span> {RELATION_LABEL[e.relation]} this
                          </>
                        )}
                        {e.provenance === 'discovered' ? <span className="muted"> (discovered)</span> : null}
                      </li>
                    ))}
                    {selEdges.length === 0 ? <li className="muted">None in current view</li> : null}
                  </ul>
                </div>
                {selClusters.length > 0 ? (
                  <div>
                    <strong>Clustered neighbours</strong>
                    <ul className={styles.relList}>
                      {selClusters.map((c) => (
                        <li key={c.id}>
                          {c.label} ({RELATION_LABEL[c.relation]})
                          {c.healthCounts && (c.healthCounts.fault > 0 || c.healthCounts.warning > 0) ? (
                            <span className="muted">
                              {' '}
                              — {c.healthCounts.fault} fault, {c.healthCounts.warning} warning
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="muted">Clustered to keep the view readable. Browse members in the asset inventory.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Select an asset.</p>
            )}
          </aside>
        </div>
      )}
      <div className={styles.legend} aria-hidden={mode === 'table'}>
        <span>Solid line: declared or reviewed relation</span>
        <span>Dashed line: discovered, not reviewed</span>
        <span>Bold outline: focus asset</span>
        <span>Double-click or “Expand neighbours” to load more</span>
      </div>
    </>
  );
}
