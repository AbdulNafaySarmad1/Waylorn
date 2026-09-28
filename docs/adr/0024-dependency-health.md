# ADR 0024: Separate API readiness from asynchronous broker health

Status: accepted, 2026-09-28

## Context

The original readiness route checked only PostgreSQL. A process could report ready while its configured Keycloak realm could not be reached. NATS JetStream and Redpanda are also operational dependencies, but event publication uses a PostgreSQL outbox and retries asynchronously; their outage need not remove API reads and record intake.

## Decision

`/health/live` remains a process-only check. `/health/ready` requires PostgreSQL connectivity and a bounded live Keycloak discovery response with the configured issuer and a JWKS URI. `/health/eventing` separately verifies both required NATS JetStream streams and metadata for the audit topic in Redpanda when eventing is enabled. In local Development with eventing disabled, it returns `disabled`. Failed checks return HTTP 503 without exposing connection strings or broker addresses.

The eventing route is a broker configuration and reachability signal, not a substitute for monitoring outbox age, retries, or end-to-end consumer delivery. A broker outage leaves API readiness green because queued outbox records can be retried after recovery.

## Consequences

Deployment routing can use `/health/ready` without turning a broker outage into an API outage. Operators must monitor `/health/eventing` and outbox lag separately. Keycloak discovery is checked on each readiness request with a three-second bound; a temporary identity-provider outage can mark the API unready even while already cached JWT keys remain usable. This favors conservative startup and routing over cached-token availability.
