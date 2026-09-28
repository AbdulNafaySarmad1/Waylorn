# ADR 0023: Report site gateway connectivity from authenticated heartbeats

Status: accepted, 2026-09-28

## Context

The web API previously returned `unknown` for every site's connectivity because it had no persisted evidence that the site gateway had contacted the control plane. A telemetry sample is evidence of an asset observation, not evidence of a currently connected gateway.

## Decision

The Go gateway sends a versioned heartbeat to `POST /api/v1/site-agents/heartbeat` once per polling cycle, including the site ID, configured interval, and queued observation count. The API requires a `SiteAgent` workload token with one matching `site_id`, validates bounded fields, and records its own receive time in a tenant and site scoped PostgreSQL row. A successful gateway contact is reported even if the Modbus read fails.

Site reads use the newest heartbeat for each site. No heartbeat is `unknown`; one older than the greater of 30 seconds or three polling intervals is `disconnected`; a fresh heartbeat with queued observations is `degraded`; otherwise it is `connected`. A timestamp more than two minutes in the future is treated as disconnected. These states describe gateway contact and delivery backlog only. They do not certify device health, site network reachability from a browser, or safe command execution.

## Consequences

The API can expose connectivity in `/api/v0` site and overview responses without inferring it from asset telemetry. A control-plane partition makes a working site gateway appear disconnected until it can report again. Gateway restarts retain the previous row until it becomes stale. A future agent lifecycle will need explicit enrollment, revocation, multi-agent roles, and a separate health-event stream.
