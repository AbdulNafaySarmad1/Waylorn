# Control-plane event contract v1

The .NET transactional outbox emits UTF-8 JSON. Every event has `schemaVersion: 1`, a UUID `eventId`, and UUID `organizationId`; `siteId` may be null for tenant-wide audit records. Consumers deduplicate on `eventId` and must tolerate additive fields. A breaking change requires a new topic or subject version.

| Destination | Routing | Payload fields beyond the common fields |
| --- | --- | --- |
| Redpanda | `waylorn.audit.v1` | `principal`, `action`, `targetType`, `targetId`, `outcome`, `atUtc`, optional `integrityKeyId` and `integrityTag` |
| NATS JetStream | `waylorn.control.v1.requested` | `commandId`, `assetId`, `operation`, `risk`, `state`, `atUtc` |
| NATS JetStream | `waylorn.control.v1.approval-recorded` | Same as requested, with the updated approval state |
| NATS JetStream | `waylorn.operation.v1.incident-opened` / `incident-updated` | `targetId`, `state`, `actor`, `atUtc` |
| NATS JetStream | `waylorn.operation.v1.work-order-created` / `work-order-updated` | `targetId`, `state`, `actor`, `atUtc` |

These NATS messages describe control-plane workflow records. The `WAYLORN_CONTROL` and `WAYLORN_OPERATIONS` streams have separate subject ownership. They do not authorize, dispatch, or represent physical command execution. Only a future site-side contract with independent authorization and safety checks could do that.

Redpanda keys are the event UUID. NATS uses the `Nats-Msg-Id` header for broker-window deduplication. Both transports can redeliver after a crash or expiry of the broker deduplication window, so consumers must persist their own processed-event IDs.
