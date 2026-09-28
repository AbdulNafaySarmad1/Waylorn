# ADR 0034: Share a site-wide polling budget across gateways

Status: accepted, 2026-09-28

## Context

Each gateway polls one register range at its locally approved interval. Nothing limited the combined read rate when several gateways served one site, so adding gateways could add device and OT-network load without review.

## Decision

Each site has `MaxPollsPerMinute` (default 600, 1–60,000), set by a site administrator through the audited `PUT /api/v1/sites/{siteId}/polling-budget`. One gateway cycle is one read request. A heartbeat now reports both the running interval and the locally approved `requestedIntervalMs`. The control plane sums the requested rate of the site's other non-disconnected gateways with the caller's. If the total exceeds the budget, every gateway's interval stretches by the same factor, so the combined rate lands on the budget. The heartbeat response returns `pollIntervalMs`.

The gateway adopts an assignment only if it is no faster than its approved interval and no longer than one hour. With no assignment (unreachable API or an older server) it keeps its current pace. The budget can only slow polling down; local configuration remains the upper bound on device load.

## Consequences

Adding a gateway to a busy site slows every gateway there instead of increasing load. Rebalancing happens one heartbeat at a time, so a site can briefly exceed its budget while gateways join; disconnected gateways stop counting after the heartbeat timeout. After a restart, a gateway polls at its approved interval until its first heartbeat reply. The budget counts requests, not registers or per-device limits. A device shared by several gateways, or one with a lower tolerance than the site figure, still needs a per-device limit from its site survey.
