# .NET 10 control-plane slice

Status: development slice, 2026-09-27. This is the primary application backend. It builds and has HTTP/SQLite tests, but it is not deployable next to production equipment.

## Code ownership

- `Domain`: asset, relationship, command and audit entities; fixed operation risk and approval rules.
- `Application`: command request/approval transaction and audit writer.
- `Infrastructure`: EF Core PostgreSQL context, tenant query/write guard, generated migration.
- `Api`: authenticated ASP.NET Core endpoints and organization/site/role policy checks.
- `src/contracts/ot/v1/ot.proto`: versioned draft boundary with Rust/Go. Operation numeric codes match both .NET and Rust. No live RPC exists.

The Rust crate remains at `crates/ot-core` because its code belongs to the OT plane and moving it provides no functional benefit. There is no Go service yet.

## Configure and run

Set `Authentication__Authority` to the HTTPS Keycloak realm URL, `Authentication__Audience` to the API client audience, and `ConnectionStrings__Waylorn` to a PostgreSQL connection string. Do not put secrets in the repository. The API refuses to start when any of these are missing. Keycloak must map `sub`, `org_id`, repeated `site_id` (or `*` for tenant-wide scope), `waylorn_role` (`Viewer`, `Operator`, `Administrator`, `Approver`), `principal_type=human` for approvers, and `amr` for strong-auth approval. These claim mappings are a contract to test against a real realm; they are not automatic Keycloak defaults.

Apply the EF migration with `dotnet ef database update --project src/control-plane/Waylorn.ControlPlane --startup-project src/control-plane/Waylorn.ControlPlane` after configuring PostgreSQL. `deploy/postgres/initial.sql` is an idempotent review artifact generated from that migration. Neither migration path was executed against PostgreSQL on this host because no PostgreSQL server or Docker daemon was available.

Run with `dotnet run --project src/control-plane/Waylorn.ControlPlane`. `/health/live` is process liveness; `/health/ready` checks database connectivity. API routes require a validated bearer token and are rate limited. Failures use RFC 7807 Problem Details where bodies are returned; no readiness claim covers Keycloak or brokers yet. ASP.NET Core traces are instrumented with OpenTelemetry.

## Current HTTP routes

| Route | Behavior |
| --- | --- |
| `GET /api/v1/assets?siteId=` | Up to 500 tenant/site-scoped assets. |
| `GET /api/v1/assets/{id}` | Tenant/site-scoped asset. |
| `POST /api/v1/assets` | Administrator creates asset and audit row. |
| `PUT /api/v1/assets/{id}` | Administrator updates with `version` optimistic concurrency. Site transfer is rejected. |
| `DELETE /api/v1/assets/{id}?version=` | Soft delete, rejected if referenced by a relation or command. |
| `POST /api/v1/relationships` | Administrator creates a typed relation between visible assets. |
| `GET /api/v1/assets/{id}/relationships` | Returns relations only when both endpoint assets are visible. |
| `POST /api/v1/commands` | Operator/Administrator records an AMBER or RED request; requires `Idempotency-Key`, change ticket, and window. No dispatch. |
| `GET /api/v1/commands/{id}` | Scoped command state. |
| `POST /api/v1/commands/{id}/approve` | Separate Approver, current window, ticket, MFA for RED; writes audit. No dispatch. |

The HTTP tests use an in-process fake identity service and SQLite to verify CRUD, relationship access, idempotency, approval, audit, readiness, tenant isolation, and optimistic concurrency. Production JWT validation and PostgreSQL execution require separate integration tests. NATS, Redpanda, Valkey, egress policy, AI governance, notification, billing, and infrastructure inventory are not implemented. An approval record must never be interpreted as OT authorization or physical execution.
