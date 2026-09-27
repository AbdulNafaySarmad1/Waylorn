# ADR 0017: Incident and maintenance records in the control plane

Status: accepted for the development slice, 2026-09-28.

## Context

The operator console defines incident and maintenance views, but neither had an authoritative persisted workflow. Incident state changes and work-order progress need tenant/site scoping, concurrency checks, and durable audit records. Operational notifications have a different event workload from command workflow records.

## Decision

Keep incident and internal maintenance records in the .NET modular monolith and PostgreSQL. Incidents relate to one or more registered assets at one site. An operator or administrator opens and advances an incident through `open → acknowledged → mitigated → resolved`. Work orders progress through `planned → scheduled → in_progress → completed`, with cancellation before work starts. Each mutation writes an audit record and an operational NATS outbox event in the same database transaction. Version checks reject stale updates. The read-only `/api/v0` adapter exposes incident lists and per-asset work orders to the web console.

Use `waylorn.operation.v1.>` on a separate JetStream stream for incident and work-order events. Keep `waylorn.control.v1.>` for command request and approval records. Consumers deduplicate on event ID.

## Consequences

The local Keycloak/PostgreSQL/NATS and browser checks can verify persisted records and transitions. The internal work-order system is identified as `Waylorn` in the web contract. External CMMS/ERP synchronization, notifications, automated incident detection, assignment identity validation, and cross-site incident coordination remain separate integrations. Neither an incident transition nor a work-order state change authorizes an OT command.
