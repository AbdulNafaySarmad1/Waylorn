# Waylorn

Waylorn is an industrial infrastructure control plane under design. This repository contains architecture and security baselines, a small Rust OT operation gate, and the operator console frontend (web and mobile) built against a **draft** API contract. There is no control-plane backend yet: the console runs against a clearly labelled development fixture server. Nothing here connects to equipment or performs control operations. Do not deploy it beside production equipment.

## Start here

- [Architecture assessment and gap analysis](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Implementation phases, dependencies, and test strategy](docs/implementation-plan.md)
- [IEC 62443 planning map](docs/iec-62443-mapping.md)
- Frontend: [architecture and plan](docs/frontend/architecture.md), [design language](docs/frontend/design-language.md), [testing](docs/frontend/testing.md), [dependency register](docs/frontend/dependencies.md)
- Architecture decisions: [foundation](docs/adr/0001-foundation.md), [command safety](docs/adr/0002-command-safety.md), [eventing](docs/adr/0003-event-and-state.md), [data egress and AI](docs/adr/0004-data-egress-and-ai.md), [deployment](docs/adr/0005-deployment-boundary.md), [frontend workspace](docs/adr/0006-frontend-workspace.md), [contract-first API](docs/adr/0007-contract-first-api.md), [authentication BFF](docs/adr/0008-authentication-bff.md), [live state](docs/adr/0009-live-state-and-freshness.md), [command safety UX](docs/adr/0010-command-safety-ux.md), [topology](docs/adr/0011-topology-rendering.md), [testing and fixtures](docs/adr/0012-testing-and-fixtures.md), [mobile, edge and domains](docs/adr/0013-mobile-edge-and-domains.md)

## Repository layout

| Path | Contents |
| --- | --- |
| `crates/ot-core` | Rust fail-closed OT operation gate (no device I/O) |
| `contracts/openapi` | Draft control-plane OpenAPI 3.1 contract |
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

Open http://localhost:3000 and choose a fixture user (operator, controls engineer, auditor, org admin). Every screen shows a **Development fixture data** banner while the fixture server is the backend.

## Checks

```sh
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @waylorn/web build && pnpm --filter @waylorn/web e2e
cargo test --manifest-path crates/ot-core/Cargo.toml --offline
```

On Windows the Rust tests require the MSVC C++ linker; `cargo check --manifest-path crates/ot-core/Cargo.toml --tests --offline` type-checks them without it.

The SSH Git remote is `git@github.com:AbdulNafaySarmad1/Waylorn.git`.
