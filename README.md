# Waylorn

Waylorn is an industrial infrastructure control plane under design. This repository currently contains architecture and security baselines plus a small Rust OT operation gate with unit tests. It does **not** connect to equipment or perform control operations. Do not deploy it beside production equipment yet.

## Start here

- [Architecture assessment and gap analysis](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Implementation phases, dependencies, and test strategy](docs/implementation-plan.md)
- [IEC 62443 planning map](docs/iec-62443-mapping.md)
- Architecture decisions: [foundation](docs/adr/0001-foundation.md), [command safety](docs/adr/0002-command-safety.md), [eventing](docs/adr/0003-event-and-state.md), [data egress and AI](docs/adr/0004-data-egress-and-ai.md), [deployment](docs/adr/0005-deployment-boundary.md)

## Current check

From the repository root, run `cargo test --manifest-path crates/ot-core/Cargo.toml --offline`. On Windows this requires the MSVC C++ linker; `cargo check --manifest-path crates/ot-core/Cargo.toml --tests --offline` can type-check the tests without it.

The SSH Git remote is `git@github.com:AbdulNafaySarmad1/Waylorn.git`.
