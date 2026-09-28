# ADR 0026: Retry broker publisher setup without stopping the API

Status: accepted, 2026-09-28

## Context

Outbox records are committed to PostgreSQL before publication. The API can keep accepting records during a broker outage, but the NATS publisher previously provisioned development streams before entering its retry loop. If NATS was unavailable at process startup, that setup exception could terminate the hosted service and stop the API.

## Decision

Each destination publisher now retries its broker setup after a bounded delay when setup fails. The existing outbox claim, publish acknowledgement, and per-record backoff remain in place. Cancellation during shutdown exits the retry loop. `/health/ready` remains tied to PostgreSQL and Keycloak; `/health/eventing` reports broker unavailability separately.

## Consequences

An unavailable NATS server during startup leaves the API ready to serve reads and queue records. Local verification stopped NATS before API startup: readiness returned 200, eventing returned 503, and eventing returned 200 after NATS restarted. A later outbox query showed no pending records. Operators must still alert on eventing health and queue lag; retrying does not guarantee consumer receipt.
