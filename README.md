# Waylorn

Waylorn is an industrial infrastructure control plane under development. The .NET 10 control plane now exposes an authenticated asset inventory, relationships, and command approval records. The retained Rust OT gate has no device I/O. No approval is dispatched to equipment. Do not deploy beside production equipment yet.

## Start here

- [Architecture assessment and gap analysis](docs/architecture.md)
- [.NET control-plane setup and API](docs/control-plane.md)
- [Backend ownership audit](docs/backend-audit.md)
- [Threat model](docs/threat-model.md)
- [Implementation phases, dependencies, and test strategy](docs/implementation-plan.md)
- [IEC 62443 planning map](docs/iec-62443-mapping.md)
- Architecture decisions: [foundation](docs/adr/0001-foundation.md), [command safety](docs/adr/0002-command-safety.md), [eventing](docs/adr/0003-event-and-state.md), [data egress and AI](docs/adr/0004-data-egress-and-ai.md), [deployment](docs/adr/0005-deployment-boundary.md), [.NET slice](docs/adr/0006-control-plane-slice.md)

## Current check

From the repository root:

```text
dotnet test Waylorn.slnx
cargo test --manifest-path crates/ot-core/Cargo.toml --target x86_64-pc-windows-gnu --offline
```

The Rust command uses the GNU target on this Windows host because the MSVC linker is absent. Other platforms can run `cargo test --manifest-path crates/ot-core/Cargo.toml` normally.

The SSH Git remote is `git@github.com:AbdulNafaySarmad1/Waylorn.git`.
