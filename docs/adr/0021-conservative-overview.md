# ADR 0021: Derive overview only from authoritative local records

Status: accepted, 2026-09-28

## Context

The web overview needs per-site health, incidents, freshness, and pending approvals. The control plane has inventory, incident records, approval records, and numeric observations, but no verified asset health evaluation or site link monitor.

## Decision

The overview API scopes sites and counts to the caller's organization and site claims. It counts known assets as `unknown` health and reports site connectivity as `unknown`; no inferred green state is invented. Open incidents come from unresolved incident records. Stale assets are those with an observed telemetry sample whose newest sample exceeds twice its declared interval; an asset with no telemetry remains unknown rather than stale. Pending approvals count only AMBER records for a human Approver other than the requester. The query has explicit 500-site and 10,000-observed-asset bounds.

## Consequences

The existing web dashboard can show live inventory and incident state without fixture data. It cannot claim full infrastructure health, link status, or telemetry coverage. Dedicated health evaluation, interval policy, and site-heartbeat data are required before those fields can be promoted from `unknown`.
