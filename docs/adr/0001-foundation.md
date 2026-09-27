# ADR 0001: Local-first modular foundation and deny-by-default OT gate

Date: 2026-09-27. Status: accepted for the initial repository baseline; revisit before a site pilot.

## Context

The repository was empty. The requested product spans decades of industrial equipment, IT/cloud assets, several deployment models, and safety-relevant command paths. Implementing a broad stack before selecting a pilot site would create unverified protocol and safety assumptions.

## Decision

Start with a .NET 10 modular monolith for domain/API work, a separate Rust OT agent, and a Go site gateway. Keep raw sensitive data local and cloud optional. PostgreSQL is the internal reference store; NATS and Redpanda have distinct event classes; Valkey holds only disposable cache. The first executable artifact is a dependency-free Rust operation gate that allows only explicitly declared GREEN observation and rejects AMBER/RED. No device I/O, authorization service, or command dispatch is present in this baseline.

Use relational assets and typed relationships. Add graph storage, QUIC, Kubernetes, and per-protocol services only against demonstrated requirements. New adapters are read-only until site-approved write workflows are separately built and validated.

## Consequences

The initial release can be tested offline and cannot command equipment. It is not a deployable control plane. Next work must establish protocol-specific lab evidence, identity, authorization, audit durability, and site gateway boundaries before any operational pilot. A later ADR is required for each protocol write surface, AI tool exposure, connector sandbox, deployment mode, and consequential command workflow.
