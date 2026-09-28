# ADR 0029: Isolate observation replay from gateway heartbeats

Status: accepted, 2026-09-28

## Context

The Go gateway may poll every 250 ms. Each successful cycle sends an observation and a heartbeat, up to roughly 480 API requests per minute before replaying any spooled observations. A shared 120-per-minute API limit could reject healthy traffic. After an outage, replay could consume that same allowance and block heartbeats, making a connected gateway appear disconnected.

## Decision

Keep the general authenticated API limit at 120 requests per minute per subject. Use separate per-subject fixed-window limits of 600 observation requests and 300 heartbeat requests per minute on their specific routes. Authentication and the single-site workload checks still apply before either write. A 429 response includes a bounded `Retry-After`; the Go gateway retains the rejected batch and pauses observation replay until that interval passes. The observation limit bounds replay pressure; the independent heartbeat allowance preserves contact reporting during a backlog.

## Consequences

The 250 ms pilot interval fits within both route limits in steady state. Large spools drain over multiple windows; a 429 observation response leaves the batch on disk and the next cycles continue local reads and heartbeats. These limits are admission controls, not a proven PostgreSQL capacity budget. Site deployments must size polling, sample count, retention, and replay against measured hardware and disk capacity.
