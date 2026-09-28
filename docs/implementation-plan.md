# Implementation plan, dependency decisions, and test strategy

## Phases and exit gates

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — baseline (complete) | Repository assessment, threat model, ADR, IEC planning map, Rust operation gate | Five Rust tests pass with the GNU target. Explicit non-production status and no device I/O. |
| 1 — read-only site pilot (partial) | Modbus TCP simulator first, asset discovery/reconciliation, local telemetry store, Go outbound gateway, .NET asset/identity API | Loopback simulator observation passes Rust → Go → Keycloak → .NET → PostgreSQL → API. The web Assets/Sites pages passed a live browser test. Gateway cancellation, bounded replay, rate-limit backoff, rejected-file retention, and the site-wide polling budget (ADR 0034) have automated tests. Real hardware, extended outage/disk-pressure drills, per-device polling limits, asset discovery/reconciliation, authenticated Protobuf RPC, and secure gateway lifecycle remain. |
| 2 — operational platform (partial) | Versioned events, NATS for operations, Redpanda for streams, PostgreSQL reference data, Valkey cache, observability, Keycloak, classified egress | Local NATS outage and cache-loss drills passed; incident and maintenance mutations publish through a separate operational outbox stream, and local broker acknowledgements were confirmed. Audit records are HMAC-signed in a per-organization hash chain whose verification detects deletion, reordering, and truncation (SQLite and PostgreSQL concurrency tests), and AMBER approval requires MFA evidence, verified end to end with a TOTP-enrolled Keycloak approver in the local smoke test. Database failover and restore, immutable external retention of the audit stream, approver self-enrolment and recent-authentication age, classified egress, broader ABAC evidence, and air-gap install test remain. |
| 3 — protocol and integration breadth | Additional OT adapters, constrained connector SDK, customer DB/ERP/SOC/cloud integrations | Protocol conformance matrix, vendor lab certification where required, connector isolation and revocation tests. |
| 4 — controlled administration | AMBER command workflow with change ticket, approval, site-side reauthorization, durable audit | Hazard review, operator usability study, duplicate/replay/partition tests, rollback procedures. |
| 5 — candidate RED operations | Individually justified physical-impact actions only if customer safety case warrants them | Independent site safety approval, hardware interlocks, HIL testing, separate release gate. No general RED API. |
| 6 — analytics/AI | R reliability jobs, Python ML lineage, provider-neutral AI gateway | Reproducible metrics and uncertainty validation; data-egress tests; no AI control path. |

Do not treat phases as calendar estimates. Each pilot chooses its first protocol and site hardware based on access, license, and safety review. More protocols or SDKs are added only after a real integration requirement.

## Dependency decisions

| Decision | Reason / constraint |
| --- | --- |
| Rust stdlib for the current gate | Pure logic needs no dependency and can run offline. Production adapters add maintained protocol crates only after parser review and fuzz coverage. |
| .NET 10 modular monolith + PostgreSQL | One transactional domain source of truth before service extraction. Migration and row-level tenant/site protections need explicit design. |
| Go gateway | Small site networking component with controlled outbound connections; QUIC only where it improves measured loss/latency or connection migration. |
| Keycloak | Central federation and workload identity; site outage policy must be explicit. |
| NATS JetStream + Redpanda | Separate low-latency operations from high-volume durable streams. Introduce each only when the corresponding workload exists; no dual publishing by default. |
| Valkey | Cache only. Rebuild all keys from authoritative stores. |
| OpenTelemetry | Common traces, metrics, logs with customer exporter support; avoid raw sensitive payloads in telemetry. |
| Local S3-compatible storage + Parquet/Zstandard | Efficient historical data and configurable retention. Immutable/WORM backend requires site-specific validation. |
| OCI, RHEL/SELinux, Podman/Kubernetes as appropriate | Shared artifact and hardened reference host; avoid orchestration dependency for a small or disconnected site. |

Evaluate license, maintenance history, CVEs, interoperability, offline availability, and long-term support before adding any third-party dependency. Pin versions and maintain an approved dependency register. No SDK crosses into OT without isolation and a site-specific test plan.

## Test strategy

1. **Logic and schema:** unit/property tests for capability defaults, RBAC/ABAC, egress classification, retention, command expiry/idempotency, and schema compatibility. Current Rust gate and .NET policy/HTTP/SQLite tests run locally; local live infrastructure checks cover identity, persistence, broker delivery/recovery, and cache loss. Additional policy and schema tests remain.
2. **Protocol boundary:** parser corpora and continuous fuzzing for every adapter; differential tests against independent implementations where possible; real hardware and simulation with bounded polling. No active probing of customer networks without a site plan.
3. **Integration:** contract tests for Keycloak, NATS, Redpanda, PostgreSQL, Valkey, storage, cloud and ERP/SOC connectors. Verify audit and authorization decisions across retries and crash recovery.
4. **Failure drills:** cloud outage, WAN/DNS/IdP failure, NATS/Redpanda failure, Valkey loss, PostgreSQL failover, disk pressure, clock drift, certificate expiry, gateway restart, partial partition. Assert factory control remains independent and consequential operations deny on uncertainty.
5. **Security:** SAST, dependency/secret/container scans, SBOM, signed provenance, DAST for APIs, penetration tests, tenant escape and connector sandbox tests. Maintain vulnerability triage and update runbooks.
6. **Site acceptance:** site-specific zone/conduit review, legacy compatibility, operator training, restore rehearsal, physical interlock and HIL tests before any process-impacting action.

Every test records artifact version, environment, result, and defect link. A passing software suite is not a substitute for a site safety case or independent assessment.
