# Waylorn

Waylorn is an industrial infrastructure control plane under development. The .NET 10 control plane exposes an authenticated asset inventory, relationships, and command approval records. The retained Rust OT gate has no device I/O. No approval is dispatched to equipment. The operator console (web and mobile) is built against a **draft** API contract that the .NET API does not implement yet, so it currently runs against a clearly labelled development fixture server. Do not deploy beside production equipment yet.

## Start here

- [Architecture assessment and gap analysis](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Implementation phases, dependencies, and test strategy](docs/implementation-plan.md)
- [IEC 62443 planning map](docs/iec-62443-mapping.md)
- Backend: [.NET control-plane slice](docs/control-plane.md), [backend audit](docs/backend-audit.md)
- Frontend: [architecture and plan](docs/frontend/architecture.md), [design language](docs/frontend/design-language.md), [testing](docs/frontend/testing.md), [dependency register](docs/frontend/dependencies.md)
- Architecture decisions: [foundation](docs/adr/0001-foundation.md), [command safety](docs/adr/0002-command-safety.md), [eventing](docs/adr/0003-event-and-state.md), [data egress and AI](docs/adr/0004-data-egress-and-ai.md), [deployment](docs/adr/0005-deployment-boundary.md), [.NET slice](docs/adr/0006-control-plane-slice.md), [frontend workspace](docs/adr/0007-frontend-workspace.md), [contract-first API](docs/adr/0008-contract-first-api.md), [authentication BFF](docs/adr/0009-authentication-bff.md), [live state](docs/adr/0010-live-state-and-freshness.md), [command safety UX](docs/adr/0011-command-safety-ux.md), [topology](docs/adr/0012-topology-rendering.md), [testing and fixtures](docs/adr/0013-testing-and-fixtures.md), [mobile, edge and domains](docs/adr/0014-mobile-edge-and-domains.md)

## Repository layout

| Path | Contents |
| --- | --- |
| `src/control-plane` | .NET 10 control plane (assets, relationships, command approvals, audit) |
| `tests/Waylorn.ControlPlane.Tests` | .NET HTTP and domain tests |
| `src/contracts/ot/v1` | Versioned Protobuf boundary with the future Rust/Go OT plane |
| `deploy/postgres` | Reviewed SQL generated from the EF Core migration |
| `crates/ot-core` | Rust fail-closed OT operation gate (no device I/O) |
| `contracts/openapi` | Draft OpenAPI 3.1 contract the operator console is built against |
| `packages/contracts` | Generated TypeScript types and typed client |
| `packages/domain` | Shared presentation and safety logic (freshness, safety ceremony, topology layout, formatting) |
| `packages/design-tokens` | Colour, type and spacing tokens (CSS and TypeScript) |
| `apps/web` | Next.js operator console with OIDC backend-for-frontend |
| `apps/mobile` | Expo field app (alerts, approvals review, asset lookup, maintenance, health) |
| `tools/dev-fixtures` | Development-only API and OIDC issuer serving fictional fixture data |

## Run the console locally

Requires Node.js 22.12+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev          # fixture server on :4010 and the web console on :3000
```

Open http://localhost:3000 and choose a fixture user (operator, controls engineer, auditor, org admin). Every screen shows a **Development fixture data** banner while the fixture server is the backend. Running the console against the .NET API requires aligning the two contracts first (see [frontend architecture §10](docs/frontend/architecture.md)).

## Checks

From the repository root:

```sh
dotnet test Waylorn.slnx
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @waylorn/web build && pnpm --filter @waylorn/web e2e
cargo test --manifest-path crates/ot-core/Cargo.toml --offline
```

On Windows without the MSVC linker, run the Rust tests with `--target x86_64-pc-windows-gnu`.

The SSH Git remote is `git@github.com:AbdulNafaySarmad1/Waylorn.git`.
