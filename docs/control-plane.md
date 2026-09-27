# .NET 10 control-plane slice

Status: development slice, 2026-09-27. This is the primary application backend. It builds and has HTTP/SQLite tests and a live local integration test, but it is not deployable next to production equipment.

## Code ownership

- `Domain`: organization, site, zone, asset, relationship, command and audit entities; fixed operation risk and approval rules.
- `Application`: command request/approval transaction and audit writer with transactional outbox.
- `Infrastructure`: EF Core PostgreSQL context, tenant query/write guard, migrations, NATS/Redpanda outbox publishers, and a short-lived Valkey asset cache.
- `Api`: authenticated ASP.NET Core endpoints and organization/site/role policy checks.
- `src/contracts/ot/v1/ot.proto`: versioned draft boundary with Rust/Go. Operation numeric codes match both .NET and Rust. No live RPC exists.

The Rust crate remains at `crates/ot-core` because its code belongs to the OT plane and moving it provides no functional benefit. There is no Go service yet.

## Configure and run

Set `Authentication__Authority` to the HTTPS Keycloak realm URL, `Authentication__Audience` to the API client audience, and `ConnectionStrings__Waylorn` to a PostgreSQL connection string. Do not put secrets in the repository. The API refuses to start when any of these are missing. Keycloak must map `sub`, `org_id`, repeated `site_id` (or `*` for tenant-wide scope), `waylorn_role` (`Viewer`, `Operator`, `Administrator`, `Approver`), `principal_type=human` for approvers, and `amr` for strong-auth approval. These claim mappings are a contract to test against a real realm; they are not automatic Keycloak defaults.

For the loopback-only development container, `ASPNETCORE_ENVIRONMENT=Development` and `Authentication__AllowInsecureLoopback=true` permit an `http://127.0.0.1` issuer. Production configuration still requires HTTPS metadata.

Apply the EF migrations with `dotnet ef database update --project src/control-plane/Waylorn.ControlPlane --startup-project src/control-plane/Waylorn.ControlPlane` after configuring PostgreSQL. `deploy/postgres/initial.sql` is an idempotent review artifact generated from both migrations. Both migrations were applied to local PostgreSQL 17 in the development Compose stack.

Run with `dotnet run --project src/control-plane/Waylorn.ControlPlane`. `/health/live` is process liveness; `/health/ready` checks database connectivity. API routes require a validated bearer token and are rate limited. Failures use RFC 7807 Problem Details where bodies are returned; no readiness claim covers Keycloak or brokers yet. ASP.NET Core traces are instrumented with OpenTelemetry.

Set `Eventing:Enabled=true`, `Eventing:NatsUrl`, and `Eventing:KafkaBootstrapServers` to enable independent outbox publishers. Eventing is required by default outside Development. Provision the `WAYLORN_CONTROL` JetStream stream for `waylorn.control.v1.>` and the `waylorn.audit.v1` Kafka topic before production startup. `Eventing:BootstrapDestinations=true` is only for the local development stack. Audit events go only to Redpanda; command request and approval-record events go only to NATS. These are records of workflow state, **never executable OT commands**. Publishers claim rows with a lease and retry with backoff after broker failure. Delivery is at least once; consumers must deduplicate by `eventId`. The outbox must be monitored for age and retry count before any production use.

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
| `POST /api/v1/commands` | Operator/Administrator records an AMBER or RED request; requires `Idempotency-Key`, change ticket, and window. No dispatch. |
| `GET /api/v1/commands/{id}` | Scoped command state. |
| `POST /api/v1/commands/{id}/approve` | Separate Approver, current window, ticket, MFA for RED; writes audit. No dispatch. |
| `GET /api/v1/audit` | Administrator-only, site-scoped audit rows with optional target filter and stable cursor pagination (up to 100). |
| `GET /api/v1/audit/{id}` | Administrator-only record lookup with tenant/site enforcement. |

The frontend also uses a read-only `/api/v0` adapter:

| Route | Behavior |
| --- | --- |
| `GET /api/v0/me` | Keycloak subject, display identity, and the registered organization. |
| `GET /api/v0/orgs/{orgId}/sites` | Claim-scoped PostgreSQL sites. Connectivity is `unknown` until a live site agent exists. |
| `GET /api/v0/orgs/{orgId}/hierarchy` | Region, site, and zone levels with current asset counts. Production lines are not yet modeled. |
| `GET /api/v0/orgs/{orgId}/assets` | Claim-scoped asset search, supported filters, and offset pagination. Unsupported live-data filters return 501. |
| `GET /api/v0/orgs/{orgId}/assets/{assetId}` | Claim-scoped detail from current registry fields. Unavailable extension, capabilities, protocols, and actions are omitted or empty. |

Registry assets have no tag, lifecycle, or measured health fields yet. The adapter emits an `UNASSIGNED-{id}` display tag and explicit `unknown` state. It does not infer site connectivity or OT capabilities. Offset pagination is not stable across concurrent inventory changes; use the `/api/v1` audit cursor for stable audit browsing.

The HTTP tests use an in-process fake identity service and SQLite to verify CRUD, relationship access, idempotency, approval, audit, readiness, tenant isolation, and optimistic concurrency. The local Compose smoke verified real Keycloak JWT validation, PostgreSQL writes and migration, NATS and Redpanda outbox acknowledgements, NATS outage recovery while Redpanda continued, and Valkey loss with PostgreSQL fallback. This is local development evidence only. Egress policy, AI governance, notification, billing, infrastructure inventory, a Go gateway, a Rust transport bridge, and site hardware validation remain unimplemented. An approval record must never be interpreted as OT authorization or physical execution.

Organizations, sites, and zones are explicit tenant-owned records. New assets require a registered site and any selected zone must belong to it. Existing installations need a site backfill before a future database foreign key can enforce this relationship for historical assets. Keycloak site claims remain the authorization source; adding a site record does not grant access.

The local browser integration test signs in through Keycloak and verifies the web Assets and Sites pages against the live adapter and PostgreSQL. The rest of the draft `/api/v0` contract remains separate from these implemented routes. Fixture-backed pages are not evidence of live backend integration.
