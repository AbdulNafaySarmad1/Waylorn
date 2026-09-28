# Site observation envelope v1

The Rust `ot-observe` process emits one local JSON result: `{"schemaVersion":1,"values":[4660]}`. The Go site gateway validates it and sends a bounded JSON batch to `POST /api/v1/observations`. This is the implemented local observation contract; `src/contracts/ot/v1/ot.proto` remains a draft for a future authenticated RPC boundary.

```json
{
  "schemaVersion": 1,
  "requestId": "11111111-1111-4111-8111-111111111111",
  "siteId": "22222222-2222-4222-8222-222222222222",
  "assetId": "33333333-3333-4333-8333-333333333333",
  "source": "site-agent/modbus-tcp",
  "observedUtc": "2026-09-28T00:00:00Z",
  "expectedIntervalMs": 1000,
  "values": [{ "signalKey": "modbus.holding.10", "value": 4660 }]
}
```

The API requires a Keycloak `SiteAgent` workload token with exactly one `site_id` claim matching the batch site and a bounded subject. It validates the tenant, registered industrial asset, timestamp, register values, and signal key syntax. A batch has 1–125 unique signals. A successful first write returns 202; an identical retry returns 200; reuse of a request ID with different data returns 409. Raw ingestion is disabled unless the control-plane deployment explicitly sets `Telemetry:AcceptRawObservations=true`. Enable it only for a customer-controlled site-local data store.

The same site identity reports gateway contact through `POST /api/v1/site-agents/heartbeat` with `{ "schemaVersion": 1, "siteId": "...", "intervalMs": 1000, "spoolDepth": 0 }`. The API stores its own receive time and uses heartbeat freshness for web connectivity. This measures gateway contact and queued observations, not device health.

Observation ingest and heartbeat use separate per-agent request limits (600 and 300 per minute respectively). A 429 includes `Retry-After`; the gateway retains the rejected observation and pauses replay for that bounded interval. Heartbeat capacity remains available even when observation replay is rate limited.

The gateway reads one configured Modbus range and cannot request writes. It keeps unacknowledged batches in a local spool and sends them only to a loopback site-local API. Loopback HTTP needs an explicit development flag. OAuth client credentials are site-scoped; optional client certificate and CA settings are supported. Protect the spool with host disk encryption and local access controls. The current 10,000-file spool limit and configured 1–365 day ingest window (seven days by default) mean a longer outage requires operator recovery before replay. No cloud tunnel, hardware certification, or cross-runtime Protobuf RPC is claimed.

SIGTERM and SIGINT cancel the current read or HTTP request. A spooled batch is deleted only after API acknowledgement; any unacknowledged batch remains for restart replay with the same request ID.

Replay sends at most 50 queued batches before and 50 after each read, with a five-second deadline for each replay pass. One heartbeat follows each cycle, including cycles with read or replay errors. Replay ignores symlinks and only sends regular `.json` files. Operators should investigate a queue that does not shrink after connectivity is restored.

The gateway retains API-rejected batches with status 400, 404, 409, 413, or 422 in a protected `rejected` spool subdirectory and reports an error. Later queued batches continue on subsequent cycles. The 10,000-file limit and heartbeat depth include active and rejected regular files, including incomplete temporary files. Operators must investigate and deliberately requeue or archive rejected batches; the gateway does not silently discard them.
