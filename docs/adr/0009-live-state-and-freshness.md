# ADR 0009: Live state transport and staleness semantics

Date: 2026-09-27. Status: accepted.

## Decision

- Live asset state and alerts use Server-Sent Events relayed by the BFF (`/api/bff/stream/...`). SSE works through enterprise proxies and edge providers, reconnects natively, and carries `Last-Event-ID` for resumption. WebSockets are reserved for bidirectional needs (none today).
- Every live value carries `observedAt` and the server supplies the expected update interval. The domain package classifies each value as `fresh`, `delayed` (> 2× interval), `stale` (> 5× interval), or `unknown` (never observed, or stream disconnected). Thresholds are server-configurable per signal.
- On disconnect, the UI keeps last values visible but marks them `unknown` with the last-observed time. It never blanks values (operators lose context) and never presents them as current.
- The client never aggregates raw telemetry. Historical charts request server aggregates with a point budget.

## Consequences

Operators can tell at a glance whether a number is current, and the decision is textual as well as colour-coded. Staleness logic is unit-tested in `packages/domain` and exercised in E2E by severing the stream.
