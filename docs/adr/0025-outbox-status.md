# ADR 0025: Expose scoped outbox delivery lag

Status: accepted, 2026-09-28

## Context

NATS and Redpanda publishing retries from PostgreSQL, so a broker outage does not necessarily make the API unready. A broker health check cannot show whether events have accumulated or whether the publisher has recovered. Operators need a bounded status view without event payloads or internal error strings.

## Decision

`GET /api/v1/operations/outbox` returns pending count, retrying count, and the oldest pending timestamp for Audit, Control, and Operations destinations. Only an Administrator with an organization and site claim can call it. PostgreSQL tenant filtering applies; a site-scoped administrator sees only rows for claimed sites, while a wildcard site claim can include organization-wide records. The query aggregates in PostgreSQL so queue size does not expand API memory use.

## Consequences

The endpoint gives a direct signal for alerting on age and retries, but it does not prove consumer receipt or order. Operators should compare it with `/health/eventing` and alert on sustained pending age and retry growth. The route never exposes payloads, subjects, claim tokens, or last-error text. SQLite HTTP tests aggregate locally because that test provider cannot aggregate `DateTimeOffset`; production uses PostgreSQL aggregation.
