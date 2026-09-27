# ADR 0013: Frontend test strategy and fixture isolation

Date: 2026-09-27. Status: accepted.

## Decision

- Unit tests (Vitest) for `packages/domain`; component tests (Vitest + Testing Library + jsdom) with axe checks for web components; authorization UX tests assert that hidden or disabled actions still surface backend denials correctly.
- E2E, accessibility and visual regression tests use Playwright against the production build of `apps/web` pointed at `tools/dev-fixtures`, which implements the draft contract and a development OIDC issuer.
- Degraded connectivity is tested explicitly: fixture server switches (`/__fixture/control`) sever the SSE stream, delay responses, and return 503s, and tests assert stale/unknown presentation.
- Performance tests: domain-level budgets (topology layout of the maximum node budget, freshness classification over 10k values) and a Playwright navigation budget for the asset list.
- Fixtures live only in `tools/dev-fixtures` and test directories. The fixture server refuses to start with `NODE_ENV=production`; its responses carry `x-waylorn-data-source: fixture`, which the UI surfaces as a persistent banner. Application code contains no fixture data and no authentication bypass: development login goes through the fixture OIDC issuer using the same code path as Keycloak.
- Storybook is deferred until the component set stabilises; component tests and the fixture-backed app are the reference in the meantime.

## Consequences

The dev experience needs two processes. In exchange, the auth and data paths exercised in development are the production paths.
