# Backend ownership audit — 2026-09-27

## Existing code

`crates/ot-core` is the only Rust crate. It defines operation risk classes, a fail-closed eligibility gate, and a bounded read-only Modbus TCP client verified against a loopback simulator. It has no asset database, API, identity, broker, or business workflow. Its behavior belongs in the OT/device plane. Retain its location and API; relocation would be cosmetic and would disrupt the current build path.

No control-plane responsibilities are implemented in Rust. The earlier architecture documents already assign the control plane to .NET. A small Go site process now invokes the read-only Rust Modbus binary and forwards site-local observations; it does not yet provide the planned secure tunnel or general gateway lifecycle.

## Required runtime contracts

| Contract | Producer → consumer | Planned transport | Status |
| --- | --- | --- | --- |
| Site identity, inventory observation, telemetry acquisition request | Rust ↔ .NET via Go gateway | Versioned Protobuf over authenticated internal RPC | Loopback simulator observation works over a versioned local JSON result and outbound authenticated HTTP; Protobuf RPC remains draft |
| Command request, expiry, acknowledgement and outcome | .NET ↔ site agent | NATS JetStream, site-side authorization | Request/approval record events publish from an outbox; no site command dispatch or outcome contract yet |
| High-volume telemetry, audit, security, integrations | Site/.NET → consumers | Redpanda with versioned schemas | Audit JSON v1 events publish from an outbox; site-local numeric telemetry is stored in PostgreSQL for the pilot; telemetry streaming and security/integration events remain absent |
| Gateway session and route health | Go ↔ .NET | Authenticated versioned RPC and NATS health events | Not implemented |

The first .NET slice stores reference assets, relationships, approvals, audits, a bounded site-local numeric observation history, and broker outbox records in PostgreSQL. It does not command equipment. The loopback simulator bridge is not a site-ready transport; authenticated cross-runtime RPC and hardware compatibility tests must precede site use.

The merged web/mobile workspace carries a frontend-proposed `/api/v0` OpenAPI draft at `contracts/openapi/control-plane.v0.yaml`. A read-only adapter serves identity, sites, region/site/zone hierarchy, asset list/detail, and numeric telemetry snapshot, state stream, and history from Keycloak and PostgreSQL. A local browser test verifies login and Assets/Sites pages; telemetry routes have HTTP tests and a cross-runtime loopback smoke. Reliability, incidents, governance, and other `/api/v0` domains remain unimplemented; development fixtures are still used for those views. The draft contract must not be interpreted as evidence that all routes exist.

## Non-goals of the first slice

No physical command execution, no implicit remote route to PLCs, no AI command tool, no silent fallback when PostgreSQL or Keycloak is unavailable. An approved record is only an approval record, never proof of dispatch or physical result.
