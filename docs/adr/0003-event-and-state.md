# ADR 0003: Distinct operational and durable event paths

Date: 2026-09-27. Status: accepted as target architecture; brokers are not installed.

## Decision

Use PostgreSQL for authoritative internal reference and command state. Use NATS JetStream for operational events, expiring command envelopes, acknowledgements, and coordination. Use Redpanda for high-volume telemetry, security/audit, integration, and historical streams. Use Valkey only for reconstructible cache. Version schemas and pair database changes with an outbox; use consumer inbox/idempotency and local store-and-forward across partitions.

## Consequences

Two brokers add operational cost, so each enters only when its workload exists. A broker delivery acknowledgement is never a physical outcome. Broker or cache loss cannot corrupt asset identity or command approval. Audit evidence additionally needs durable integrity protection independent of stream retention.
