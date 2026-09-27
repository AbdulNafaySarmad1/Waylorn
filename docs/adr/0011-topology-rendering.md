# ADR 0011: Bounded topology exploration

Date: 2026-09-27. Status: accepted.

## Decision

- Topology is explored from a focus asset or cluster. The server returns a neighbourhood bounded by depth, relation types, and a node limit, plus cluster summaries (by zone/line/kind) for what lies beyond the bound. The client refuses to hold more than 300 nodes and asks the user to narrow scope instead.
- Layout is a deterministic layered layout computed in `packages/domain` (stable positions across refreshes aid spatial memory). Rendering uses SVG with pan and zoom; no force-directed animation.
- Dependency tracing and impact analysis are backend queries (upstream/downstream over `DEPENDS_ON`, `CONTROLS`, `HOSTED_ON`, `SENDS_DATA_TO`); the UI highlights the returned path.
- Every graph has an equivalent accessible table view (relations list with source, relation, target) reachable by keyboard.

## Consequences

Users never see a 5,000-node hairball. Large estates are navigated through clusters, search and progressive expansion. A graph database is not implied; ADR 0001's relational adjacency remains.
