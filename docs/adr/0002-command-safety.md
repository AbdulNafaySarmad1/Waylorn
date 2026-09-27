# ADR 0002: Consequential command boundary

Date: 2026-09-27. Status: accepted as safety constraint; execution design remains open.

## Decision

Classify operations as GREEN observation, AMBER administration, or RED physical-process impact. Discovery grants no authority. The phase-0 Rust gate permits only explicitly declared GREEN operations and rejects all AMBER and RED. Future commands must pass backend identity, RBAC/ABAC, ticket/window checks, durable audit, expiry/idempotency, and independent site-side reauthorization. RED additionally needs a fresh named human approval, a site-specific safety case, and external process interlocks. An LLM never receives a physical-process command tool.

## Consequences

No generic write API or bulk override exists. Timeouts and partial failure produce an unknown outcome that must be reconciled, never an assumed success. This constraint can limit automation, but prevents a broad remote command surface before site evidence exists. The exact approval and HIL design needs its own ADR before implementation.
