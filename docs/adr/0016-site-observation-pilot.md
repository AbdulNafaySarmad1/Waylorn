# ADR 0016: Site-local read-only observation pilot

Status: accepted for the simulator pilot, 2026-09-28.

## Context

The OT crate could read Modbus TCP registers but had no runtime path to the .NET control plane. The first target is a loopback Modbus simulator. Raw industrial measurements should remain local by default, and an outage must not turn a successful device read into silent data loss.

## Decision

Keep Modbus device I/O in Rust. Run a small Go site process that invokes the read-only Rust binary for an explicitly configured endpoint and range, validates its versioned result, spools observations on local disk, and sends them outbound with a site-scoped Keycloak workload token. The .NET control plane accepts a versioned batch only when raw ingestion is explicitly enabled at a site-local deployment. It validates the asset and site, deduplicates retries, stores a seven-day numeric history in PostgreSQL, and serves scoped live snapshot, stream, and history APIs. The live stream starts with current state on each connection; it is not an event replay log.

## Consequences

The simulator now exercises Rust, Go, Keycloak, .NET, and PostgreSQL together. The gateway does not accept inbound cloud connections or receive command requests. Its local spool must be protected by disk encryption and monitored for capacity and age. The seven-day history and 50,000-sample query cap are pilot limits. A production site gateway still needs authenticated transport design, recovery drills, hardware validation, polling budgets, and the versioned Protobuf RPC boundary before deployment beside equipment.
