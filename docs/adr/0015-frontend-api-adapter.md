# ADR 0015: Read-only frontend API adapter

Status: accepted for the development slice, 2026-09-27.

## Context

The web workspace defines a broad `/api/v0` contract while the authoritative .NET control plane exposes a smaller `/api/v1` workflow API. The operator console needs real identity and inventory data without treating frontend fixtures as a backend or inventing OT state.

## Decision

Serve a read-only `/api/v0` adapter from the same ASP.NET Core process and PostgreSQL tenant context as `/api/v1`. Implement only identity, sites, region/site/zone hierarchy, and asset list/detail backed by existing records. Require the same JWT validation and site claims. Return `unknown` for lifecycle, health, and connectivity until measured sources exist. Omit unavailable asset extensions and return no capabilities or permitted actions. Reject unsupported filters explicitly. Keep mutation and command workflows on `/api/v1`.

Run a local browser integration test through Keycloak and the web server, in addition to API tests and a live service smoke test. The development Keycloak web client uses authorization code flow and a secret stored only in ignored local files.

## Consequences

The web Assets and Sites pages can use live data without a second backend. The rest of the draft `/api/v0` contract remains unimplemented and must report unavailable responses when pointed at this service. The generated display tag is not a plant tag. Offset asset pagination can shift during concurrent writes and should be replaced with a stable cursor before large inventory use. The local web client and HTTP issuer settings are development-only.
