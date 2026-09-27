/**
 * Information architecture (docs/frontend/architecture.md §4): five workspaces instead of
 * seventeen top-level entries. `available: false` marks areas whose backend API does not
 * exist yet; they remain reachable so the gap is visible, and their pages say so.
 */
export interface NavItem {
  readonly segment: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly keywords?: string;
  readonly available: boolean;
}

export interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { segment: 'overview', label: 'Overview', shortcut: 'o', available: true },
      { segment: 'sites', label: 'Sites', shortcut: 's', keywords: 'plants hierarchy regions zones lines', available: true },
      { segment: 'assets', label: 'Assets', shortcut: 'a', keywords: 'plc hmi machines equipment inventory', available: true },
      { segment: 'topology', label: 'Topology', shortcut: 't', keywords: 'graph dependencies impact', available: true },
      { segment: 'incidents', label: 'Incidents', shortcut: 'i', keywords: 'alarms alerts', available: true },
      { segment: 'maintenance', label: 'Maintenance', keywords: 'work orders cmms', available: false },
    ],
  },
  {
    id: 'observe',
    label: 'Observe',
    items: [
      { segment: 'telemetry', label: 'Telemetry', keywords: 'signals trends historian', available: false },
      { segment: 'infrastructure', label: 'Infrastructure', shortcut: 'h', keywords: 'hosts servers kubernetes podman nats redpanda valkey certificates', available: true },
      { segment: 'reliability', label: 'Reliability', shortcut: 'r', keywords: 'mtbf mttr availability review replacement', available: true },
      { segment: 'cloud', label: 'Cloud & cost', keywords: 'aws azure gcp hetzner spend', available: true },
      { segment: 'storage', label: 'Storage', keywords: 'capacity object store worm', available: true },
    ],
  },
  {
    id: 'secure',
    label: 'Secure',
    items: [
      { segment: 'security', label: 'Security posture', keywords: 'vulnerabilities iec 62443 zones conduits', available: false },
      { segment: 'policies', label: 'Policies', keywords: 'rbac abac rules', available: false },
      { segment: 'access', label: 'Access', keywords: 'users roles identity providers', available: false },
      { segment: 'audit', label: 'Audit', shortcut: 'u', keywords: 'log evidence export', available: true },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { segment: 'ai', label: 'AI assistant', keywords: 'chat ask llm', available: true },
      { segment: 'ai/governance', label: 'AI governance', keywords: 'providers egress redaction policy', available: true },
      { segment: 'reports', label: 'Reports', available: false },
    ],
  },
  {
    id: 'administer',
    label: 'Administer',
    items: [
      { segment: 'integrations', label: 'Integrations', keywords: 'erp mes cmms siem connectors', available: false },
      { segment: 'domains', label: 'Domains & edge', keywords: 'custom domain certificate dns cloudflare', available: true },
      { segment: 'administration', label: 'Administration', available: false },
    ],
  },
];

export function allNavItems(): readonly (NavItem & { group: string })[] {
  return NAVIGATION.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
}
