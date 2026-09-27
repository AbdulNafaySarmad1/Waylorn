# ADR 0008: Contract-first API with generated clients

Date: 2026-09-27. Status: accepted; the draft contract is provisional.

## Context

The .NET control plane does not exist yet. Hand-writing DTOs in the frontend would create a second, unreviewed source of truth.

## Decision

- `contracts/openapi/control-plane.v0.yaml` (OpenAPI 3.1) is a **draft** contract proposed by the frontend. It is owned jointly until the .NET API exists; after that, the .NET build emits the OpenAPI document and this file is replaced by the emitted one.
- `packages/contracts` generates types with `openapi-typescript` and exposes a typed client built on `openapi-fetch`. Generated output is committed so builds do not require network access, and CI fails if regeneration produces a diff.
- Domain packages import types from `@waylorn/contracts`; they may add derived view types but never redeclare wire shapes.
- Live and high-volume streams stay JSON-over-SSE for now. A Protobuf schema (`buf` + `protobuf-es`) is introduced when a binary telemetry stream is actually required; that change needs its own ADR.
- Every operational response carries provenance: `observedAt`/`computedAt`, `source`, and for analytics/ML the method or model version. The contract encodes this so the UI cannot render a number without its provenance.

## Consequences

The backend team can change the contract, and the frontend recompiles against it; breaking changes surface as type errors. The draft can be wrong; the first backend integration is expected to revise it.

## Update 2026-09-27

The .NET control-plane slice (ADR 0006) now exists with its own `/api/v1` shapes. The draft remains the console's contract until the .NET build emits an OpenAPI document; the differences and the alignment plan are in [frontend architecture §10](../frontend/architecture.md).
