# .NET 10 control-plane slice

Status: development slice, 2026-09-27. This is the primary application backend. It builds and has HTTP/SQLite tests and a live local integration test, but it is not deployable next to production equipment.

## Code ownership

- `Domain`: organization, site, zone, asset, relationship, command and audit entities; fixed operation risk and approval rules.
- `Application`: command request/approval transaction and audit writer with transactional outbox.
- `Infrastructure`: EF Core PostgreSQL context, tenant query/write guard, migrations, NATS/Redpanda outbox publishers, and a short-lived Valkey asset cache.
- `Api`: authenticated ASP.NET Core endpoints and organization/site/role policy checks.
- `src/contracts/ot/v1/ot.proto`: versioned draft boundary with Rust/Go. Operation numeric codes match both .NET and Rust. No live RPC exists.

The Rust crate remains at `crates/ot-core` because its code belongs to the OT plane. A small Go site gateway now handles the outbound observation pilot, restricted to a loopback raw-observation API; it does not implement the planned general network plane.

## Configure and run

Set `Authentication__Authority` to the HTTPS Keycloak realm URL, `Authentication__Audience` to the API client audience, and `ConnectionStrings__Waylorn` to a PostgreSQL connection string. Do not put secrets in the repository. The API refuses to start when any of these are missing. Keycloak must map `sub`, `org_id`, repeated `site_id` (or `*` for tenant-wide scope), `waylorn_role` (`Viewer`, `Operator`, `Administrator`, `Approver`), and `principal_type=human` for approvers. These claim mappings are a contract to test against a real realm; they are not automatic Keycloak defaults. `amr` remains available for future site-approved RED workflows; this API does not accept RED requests.

For the loopback-only development container, `ASPNETCORE_ENVIRONMENT=Development` and `Authentication__AllowInsecureLoopback=true` permit an `http://127.0.0.1` issuer. Production configuration still requires HTTPS metadata.

Apply the EF migrations with `dotnet ef database update --project src/control-plane/Waylorn.ControlPlane --startup-project src/control-plane/Waylorn.ControlPlane` after configuring PostgreSQL. `deploy/postgres/initial.sql` is an idempotent review artifact generated from both migrations. Both migrations were applied to local PostgreSQL 17 in the development Compose stack.

Run with `dotnet run --project src/control-plane/Waylorn.ControlPlane`. `/health/live` is process liveness; `/health/ready` checks database connectivity. API routes require a validated bearer token and are rate limited. Failures use RFC 7807 Problem Details where bodies are returned; no readiness claim covers Keycloak or brokers yet. ASP.NET Core traces are instrumented with OpenTelemetry.

Set `Eventing:Enabled=true`, `Eventing:NatsUrl`, and `Eventing:KafkaBootstrapServers` to enable independent outbox publishers. Eventing is required by default outside Development. Provision `WAYLORN_CONTROL` for `waylorn.control.v1.>`, `WAYLORN_OPERATIONS` for `waylorn.operation.v1.>`, and the `waylorn.audit.v1` Kafka topic before production startup. `Eventing:BootstrapDestinations=true` is only for the local development stack. Audit events go to Redpanda; command request/approval and incident/maintenance state events go to separate NATS streams. These are records of workflow state, **never executable OT commands**. Publishers claim rows with a lease and retry with backoff after broker failure. Delivery is at least once; consumers must deduplicate by `eventId`. The outbox must be monitored for age and retry count before any production use.

Set `Cache:Endpoint` to enable Valkey for 30-second asset-detail reads. Authorization checks remain in the API after cache lookup, and writes and commands always use PostgreSQL. Cache loss falls back to PostgreSQL. An invalidation failure can leave a stale asset detail for up to 30 seconds, so this cache cannot be used to authorize consequential operations.

## Current HTTP routes

| Route | Behavior |
| --- | --- |
| `GET/POST /api/v1/organization` | Tenant-scoped organization lookup and administrator registration. |
| `GET/POST /api/v1/sites` | Claim-scoped site listing and administrator registration. |
| `GET/POST /api/v1/sites/{siteId}/zones` | Site-scoped zone listing and administrator registration. |
| `GET /api/v1/assets?siteId=` | Up to 500 tenant/site-scoped assets. |
| `GET /api/v1/assets/{id}` | Tenant/site-scoped asset. |
| `POST /api/v1/assets` | Administrator creates asset and audit row after site/zone registry validation. |
| `PUT /api/v1/assets/{id}` | Administrator updates with `version` optimistic concurrency. Site transfer is rejected. |
| `DELETE /api/v1/assets/{id}?version=` | Soft delete, rejected if referenced by a relation or command. |
| `POST /api/v1/relationships` | Administrator creates a typed relation between visible assets. |
| `GET /api/v1/assets/{id}/relationships` | Returns relations only when both endpoint assets are visible. |
| `POST /api/v1/commands` | Operator/Administrator records an AMBER request; requires `Idempotency-Key`, change ticket, and window. RED requests, including industrial/network/security configuration changes, are denied and audited. No dispatch. |
| `GET /api/v1/commands/{id}` | Scoped command state. |
| `POST /api/v1/commands/{id}/approve` | Separate Approver, current window, ticket; RED records cannot be approved. Writes audit. No dispatch. |
| `GET /api/v0/orgs/{orgId}/topology/neighborhood` | Site-scoped, bounded relationship traversal for the web graph. |
| `GET /api/v0/orgs/{orgId}/topology/impact` | Site-scoped upstream/downstream traversal over explicit dependency relations. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/actions` | Returns an empty list after authorization because there is no executable action transport or site capability evidence. |
| `GET /api/v0/orgs/{orgId}/overview` | Site-scoped asset, incident, telemetry freshness, and eligible approval counts. Health and link state remain unknown until verified. |
| `GET /api/v1/audit` | Administrator-only, site-scoped audit rows with optional target filter and stable cursor pagination (up to 100). |
| `GET /api/v1/audit/{id}` | Administrator-only record lookup with tenant/site enforcement. |
| `GET /api/v1/audit/{id}/verify` | Administrator-only HMAC check of an individual record: verified, unverified, or broken. |
| `POST /api/v1/observations` | SiteAgent workload only; bounded, versioned read-only Modbus observation batch with idempotent retry. Raw ingest is disabled unless explicitly enabled at a site-local deployment. |
| `POST/GET /api/v1/incidents`, `GET/PATCH /api/v1/incidents/{id}` | Site-scoped incident creation, asset links, read, and versioned state transition. |
| `POST /api/v1/work-orders`, `GET/PATCH /api/v1/work-orders/{id}` | Site-scoped internal maintenance work orders and versioned state transition. |

The frontend also uses a read-only `/api/v0` adapter:

| Route | Behavior |
| --- | --- |
| `GET /api/v0/me` | Keycloak subject, display identity, and the registered organization. |
| `GET /api/v0/orgs/{orgId}/sites` | Claim-scoped PostgreSQL sites. Connectivity is `unknown` until a live site agent exists. |
| `GET /api/v0/orgs/{orgId}/hierarchy` | Region, site, and zone levels with current asset counts. Production lines are not yet modeled. |
| `GET /api/v0/orgs/{orgId}/assets` | Claim-scoped asset search, supported filters, and offset pagination. Unsupported live-data filters return 501. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}` | Claim-scoped detail from current registry fields. Unavailable extension, capabilities, protocols, and actions are omitted or empty. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/live` | Latest site-local numeric signal values with explicit freshness quality. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/live/stream` | Current-state SSE signals and heartbeat; reconnect starts with current state. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/telemetry/signals` | Keys with retained numeric history. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/telemetry/series` | Bounded retention-window server aggregation, up to 2,000 buckets. |
| `GET /api/v0/orgs/{orgId}/incidents` | Site-scoped incident list with status filter and pagination. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}/maintenance` | Internal Waylorn work orders for a visible asset. |

Raw telemetry ingestion requires `Telemetry:AcceptRawObservations=true`, set only where the PostgreSQL instance is a customer-controlled site-local store. The default is disabled. `Telemetry:RetentionDays` defaults to 7 and must be 1–365; startup rejects other values. Ingestion and queries apply the same window, and an hourly worker removes expired samples. Reducing retention makes older spooled observations unreplayable, so site administrators must coordinate the gateway spool policy. This numeric register pilot does not provide Redpanda telemetry streaming, calibrated units, or sensor quality certification.

Set `Audit:KeyId` and a base64 `Audit:SigningKey` containing at least 32 random bytes through secrets management. They are required outside Development. New records receive an HMAC-SHA256 tag; old unsigned rows remain unverified. Verification protects individual row contents only. Preserve historical keys and monitor missing/broken verification; row deletion and ordering require an external immutable evidence pipeline.

Registry assets have no tag, lifecycle, or measured health fields yet. The adapter emits an `UNASSIGNED-{id}` display tag and explicit `unknown` state. It does not infer site connectivity or OT capabilities. Offset pagination is not stable across concurrent inventory changes; use the `/api/v1` audit cursor for stable audit browsing.

The HTTP tests use an in-process fake identity service and SQLite to verify CRUD, relationship access, idempotency, approval, audit, telemetry, incidents, maintenance, readiness, tenant isolation, and optimistic concurrency. The local Compose smoke verified real Keycloak JWT validation, PostgreSQL writes and migration, NATS and Redpanda outbox acknowledgements, NATS outage recovery while Redpanda continued, and Valkey loss with PostgreSQL fallback. Operational outbox rows for incident and work-order changes were acknowledged by the new NATS stream. The OT loopback smoke verified a Modbus simulator through Rust, Go, Keycloak, .NET, PostgreSQL, and the query API. This is local development evidence only. Egress policy, AI governance, notification, billing, infrastructure inventory, external CMMS integration, full Go tunnel and gateway lifecycle, authenticated Protobuf transport, and site hardware validation remain unimplemented. An approval record must never be interpreted as OT authorization or physical execution.

Organizations, sites, and zones are explicit tenant-owned records. New assets require a registered site and any selected zone must belong to it. Existing installations need a site backfill before a future database foreign key can enforce this relationship for historical assets. Keycloak site claims remain the authorization source; adding a site record does not grant access.

The local browser integration test signs in through Keycloak and verifies the web Assets, Sites, Overview, Live state, Telemetry, Incidents, Maintenance, and Topology pages against the live adapter and PostgreSQL. The rest of the draft `/api/v0` contract remains separate from these implemented routes. Fixture-backed pages are not evidence of live backend integration.
