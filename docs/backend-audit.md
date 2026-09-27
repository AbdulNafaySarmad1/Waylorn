# Backend ownership audit — 2026-09-27

## Existing code

`crates/ot-core` is the only Rust crate. It defines operation risk classes and a fail-closed eligibility gate. It has no protocol I/O, asset database, API, identity, broker, or business workflow. Its behavior belongs in the OT/device plane. Retain its location and API; relocation would be cosmetic and would disrupt the current build path.

No control-plane responsibilities are implemented in Rust. The earlier architecture documents already assign the control plane to .NET; the implementation gap is that no .NET project existed. No Go component or live Rust agent exists yet.

## Required runtime contracts

| Contract | Producer → consumer | Planned transport | Status |
| --- | --- | --- | --- |
| Site identity, inventory observation, telemetry acquisition request | Rust ↔ .NET via Go gateway | Versioned Protobuf over authenticated internal RPC | Schema draft only; no runtime connection |
| Command request, expiry, acknowledgement and outcome | .NET ↔ site agent | NATS JetStream, site-side authorization | Request/approval record events publish from an outbox; no site command dispatch or outcome contract yet |
| High-volume telemetry, audit, security, integrations | Site/.NET → consumers | Redpanda with versioned schemas | Audit JSON v1 events publish from an outbox; telemetry/security/integrations absent |
| Gateway session and route health | Go ↔ .NET | Authenticated versioned RPC and NATS health events | Not implemented |

The first .NET slice stores reference assets, relationships, approvals, audits, and broker outbox records in PostgreSQL. It does not command equipment. Rust and .NET share a documented v1 operation contract; a live bridge and compatibility test must precede site use.

The merged web/mobile workspace carries a frontend-proposed `/api/v0` OpenAPI draft at `contracts/openapi/control-plane.v0.yaml`. It includes tenancy hierarchy, telemetry, reliability, incident, governance, and many other response models that the current `/api/v1` .NET API does not serve. The frontend uses development fixtures for those views. A contract reconciliation and real API integration test are required before claiming that the operator console is backed by this control plane.

## Non-goals of the first slice

No physical command execution, no implicit remote route to PLCs, no AI command tool, no silent fallback when PostgreSQL or Keycloak is unavailable. An approved record is only an approval record, never proof of dispatch or physical result.
