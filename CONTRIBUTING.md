# Contributing to Waylorn

Thanks for your interest. Waylorn is an early-stage, vendor-neutral control plane for industrial infrastructure. Read the status warning in the [README](README.md) first: it is **not safe to deploy beside production equipment yet**, and contributions are welcome precisely because there is a lot left to build.

## License and CLA

- Waylorn is licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
- Before we can merge a pull request you must sign the [Contributor License Agreement](CLA.md). You keep your copyright; the CLA lets the project keep the freedom to evolve its licensing. To sign, comment `I have read the CLA Document and I hereby sign the CLA` on your first pull request.
- By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security problems:** do not open public issues. Follow [SECURITY.md](SECURITY.md).

## Ways to help

- Pick an issue labelled `good first issue` or `help wanted`.
- Implement parts of the draft API contract in the .NET control plane (see [frontend architecture §10](docs/frontend/architecture.md) for the current gaps).
- Add tests, improve docs, or fix small bugs.
- Review open pull requests and ADRs. Careful review is a real contribution.
- If you want to work on something big, **open an issue first** so we can agree on the approach before you invest time.

## Repository map

| Path | Contents |
| --- | --- |
| `src/control-plane` | .NET 10 control plane |
| `tests/Waylorn.ControlPlane.Tests` | .NET HTTP and domain tests |
| `crates/ot-core` | Rust fail-closed OT operation gate (no device I/O) |
| `contracts/openapi` | Draft OpenAPI contract the console is built against |
| `packages/*`, `apps/web`, `apps/mobile` | TypeScript packages, Next.js console, Expo field app |
| `tools/dev-fixtures` | Development-only fixture API and OIDC issuer |
| `docs` | Architecture, threat model, IEC 62443 map, ADRs |

## Development setup

You need only the toolchains for the part you touch.

- **Frontend (web, mobile, packages):** Node.js 22.12+ and pnpm 10 (`corepack enable`).
- **Control plane:** the .NET 10 SDK.
- **OT gate:** a stable Rust toolchain.

```sh
pnpm install
pnpm dev          # fixture server on :4010 and the web console on :3000
```

The console runs against clearly labelled **fictional fixture data**. Never put real credentials, customer data, or real equipment addresses in fixtures, tests, issues, or screenshots.

## Checks to run before opening a pull request

These mirror CI. Run the ones that cover the files you changed.

```sh
dotnet test Waylorn.slnx
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @waylorn/contracts check:generated
pnpm --filter @waylorn/web build && pnpm --filter @waylorn/web e2e
cargo test --manifest-path crates/ot-core/Cargo.toml --locked
```

If you change `contracts/openapi`, regenerate the TypeScript types with `pnpm contracts:generate` and commit the result.

## Pull request process

1. Fork the repository and create a branch from `main` (for example `feat/assets-reliability-endpoint`).
2. Keep each pull request focused on one change, and add or update tests.
3. Write clear commit messages in the imperative mood ("Add preflight endpoint"). Explain *why*, not just *what*.
4. Fill in the pull request template, including the CLA checkbox.
5. CI must pass. A maintainer will review; please respond to feedback, and expect a few rounds. Review comments are about the code, not about you.

## Safety rules specific to this project

Waylorn is designed to sit near operational technology, so some rules are strict:

- **Approval is not execution.** Do not add code paths that dispatch commands to equipment. The Rust OT gate intentionally has no device I/O; adding any needs an ADR and a threat-model update first.
- **Fail closed.** When state is stale, unknown, or ambiguous, the safe behavior is to refuse, not to guess.
- **Security-relevant changes** (authentication, tenancy, command approval, audit) need tests for the failure paths and a note in the pull request on how the [threat model](docs/threat-model.md) is affected.
- **Architecture decisions** that change a boundary or a contract belong in a new ADR under `docs/adr/`, following the existing numbering.

## Reporting bugs and requesting features

Use the issue templates. Include the commit you tested, steps to reproduce, and remove secrets and customer data from logs.
