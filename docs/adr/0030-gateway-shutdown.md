# ADR 0030: Cancel site gateway work on service shutdown

Status: accepted, 2026-09-28

## Context

The Go gateway's polling loop used a background context and had no SIGTERM/SIGINT exit path. A service stop could leave a Modbus read or HTTP request running until the supervisor killed the process. An observation may have been queued locally but not acknowledged by the API at that point.

## Decision

The process now uses a signal-derived context for the current polling cycle and exits its ticker loop on SIGTERM or SIGINT. Cancellation stops the read-only Rust child process or outbound HTTP request. Spool files are removed only after an accepted observation response, so an interrupted transfer remains for idempotent replay on restart. A cancelled cycle does not emit a misleading runtime-error log.

## Consequences

Service managers can stop the gateway promptly without dropping an unacknowledged batch. If the API accepted a batch just before cancellation but its acknowledgement was lost, replay uses the same request ID and the API's idempotency check. This does not guarantee delivery through disk loss or corruption; site deployment still needs protected persistent spool storage and recovery procedures.
