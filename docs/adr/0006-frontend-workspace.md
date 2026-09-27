# ADR 0006: Frontend workspace, framework and package boundaries

Date: 2026-09-27. Status: accepted.

## Context

TypeScript owns clients (ADR 0001). The repository had no JavaScript tooling. We need a desktop operator console, a narrower mobile app, and shared domain presentation logic that must not drift between them.

## Decision

- pnpm workspace with `apps/web` (Next.js App Router, React Server Components), `apps/mobile` (Expo / React Native), `packages/contracts` (generated API types and client), `packages/domain` (pure TypeScript domain logic), `packages/design-tokens`, and `tools/dev-fixtures`.
- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; lint forbids `any` (`@typescript-eslint/no-explicit-any`, `no-unsafe-*`). TypeScript is pinned to the 6.0 line because typescript-eslint and Next.js do not yet support the 7.x native compiler; revisit when they do.
- Styling with CSS Modules and CSS custom-property tokens. No utility-class framework and no component library dependency; dialogs use the native `<dialog>` element (focus containment and inert background are provided by the platform).
- System font stacks only. No build-time font download, so air-gapped CI works.
- Exact dependency pins, committed lockfile, `pnpm install --frozen-lockfile`, and an allowlist for dependency lifecycle scripts.

## Consequences

Fewer third-party UI dependencies means more first-party component code to test, but smaller supply-chain surface and no redesign when a UI kit changes direction. Domain logic in `packages/domain` is testable without React and is reused by mobile.
