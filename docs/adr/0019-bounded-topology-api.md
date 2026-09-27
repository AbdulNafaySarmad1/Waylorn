# ADR 0019: Bounded topology traversal from relational assets

Status: accepted, 2026-09-28

## Context

The web contract needs neighborhood and dependency impact views. Assets and typed relationships already live in PostgreSQL. A tenant-wide graph load would expose excessive data and could exhaust a request on large installations.

## Decision

The .NET API traverses relationship batches from the requested focus asset. Neighborhood depth is limited to 1–4 and returned nodes to 10–300; each hop reads at most 2,000 relationships. Nodes outside the caller's site claims are excluded before returning edges or counts. A truncated response marks a bound reached and summarizes hidden authorized neighbors as clusters. Impact traverses only `DEPENDS_ON` and `HOSTED_ON`, interpreting the source as dependent on the target. It is limited to eight hops and 300 nodes. Results are computed from current relational records and carry a timestamp; they are not a stored network-discovery truth.

## Consequences

The existing relational model serves the first topology UI without a graph database. A large or high-degree graph can be truncated; clients must show that state and permit refocusing. `CONNECTED_TO` is visible in neighborhoods but excluded from failure impact because connectivity alone does not establish dependency. All current edges have `declared` provenance; discovery/review provenance must be modeled before claiming verified topology.
