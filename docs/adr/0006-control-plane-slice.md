# ADR 0006: Initial .NET 10 control-plane slice

Date: 2026-09-27. Status: accepted for development; not a production release.

## Decision

Implement a single ASP.NET Core .NET 10 application with Domain, Application, Infrastructure, and API folders. PostgreSQL through EF Core owns assets, relationships, command approval records, and audit entries. Keycloak-issued JWTs supply principal, organization, site, and role claims; the API enforces those claims on every asset and command route. Successful mutations and denied command attempts with a known tenant write audit entries in the same database transaction. Approved commands remain in the database and are not dispatched to OT equipment.

Avoid separate services and pattern-only repositories. The future Rust/Go boundary is defined in versioned Protobuf; actual transport is deferred until an agent and gateway exist. A broker is not a substitute for transactional approval state.

## Consequences

The slice can validate tenancy, CRUD, and approval policy independently. It does not meet the full ABAC matrix, production audit immutability, site authorization, broker integration, or IEC 62443 requirements. RED execution remains impossible. Future work must add migrations exercised against PostgreSQL, Keycloak integration tests, and site-side safety gates before any command dispatch.
