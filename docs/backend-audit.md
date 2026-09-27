# Backend ownership audit — 2026-09-27

## Existing code

`crates/ot-core` is the only Rust crate. It defines operation risk classes and a fail-closed eligibility gate. It has no protocol I/O, asset database, API, identity, broker, or business workflow. Its behavior belongs in the OT/device plane. Retain its location and API; relocation would be cosmetic and would disrupt the current build path.

No control-plane responsibilities are implemented in Rust. The earlier architecture documents already assign the control plane to .NET; the implementation gap is that no .NET project existed. No Go component or live Rust agent exists yet.

## Required runtime contracts

| Contract | Producer → consumer | Planned transport | Status |
| --- | --- | --- | --- |
| Site identity, inventory observation, telemetry acquisition request | Rust ↔ .NET via Go gateway | Versioned Protobuf over authenticated internal RPC | Schema draft only; no runtime connection |
| Command request, expiry, acknowledgement and outcome | .NET ↔ site agent | NATS JetStream, site-side authorization | Not implemented; current .NET approval never dispatches |
| High-volume telemetry, audit, security, integrations | Site/.NET → consumers | Redpanda with versioned schemas | Not implemented |
| Gateway session and route health | Go ↔ .NET | Authenticated versioned RPC and NATS health events | Not implemented |

The first .NET slice stores reference assets, relationships, approvals, and audits in PostgreSQL. It does not claim to command equipment or integrate a broker. Rust and .NET share a documented v1 operation contract; a live bridge and compatibility test must precede site use.

## Non-goals of the first slice

No physical command execution, no implicit remote route to PLCs, no AI command tool, no silent fallback when PostgreSQL or Keycloak is unavailable. An approved record is only an approval record, never proof of dispatch or physical result.
