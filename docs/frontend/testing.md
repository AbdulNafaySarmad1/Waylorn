# Frontend test strategy and how to run it

See ADR 0012 for the decisions. Every layer runs offline against `tools/dev-fixtures`; nothing here talks to real equipment.

| Layer | Tooling | Location | What it proves |
| --- | --- | --- | --- |
| Domain unit + performance | Vitest | `packages/domain/test` | Freshness, safety ceremony, redirects, topology layout (5,000 nodes < 1 s), formatting, problem mapping |
| Token contract | Vitest | `packages/design-tokens/test` | CSS and TS tokens agree; every text/status token ≥ 4.5:1 on every surface in light and dark; environment badges ≥ 4.5:1 |
| Fixture API/IdP | Vitest | `tools/dev-fixtures/test` | PKCE, redirect allowlists, tenant isolation, step-up enforcement, idempotency, contract path coverage |
| Components + authorization UX | Vitest, Testing Library, axe-core | `apps/web/test` | Command review content and blockers, unavailable actions shown with reasons, denial never submittable, stale/unknown live values, no serious axe violations |
| E2E | Playwright | `apps/web/e2e/auth.spec.ts`, `commands.spec.ts` | Real OIDC redirect flow, cookie flags, security headers, CSRF, BFF allowlist, logout, tenant boundary, org switching, AMBER step-up flow, RED gating, GREEN outcome tracking |
| Degraded connectivity | Playwright + fixture controls | `e2e/degraded.spec.ts` | Severed stream → Unknown, frozen stream → Stale, disconnected site → unknown health and gaps, API failure → error with correlation ID, latency |
| Accessibility | axe (Playwright) | `e2e/a11y.spec.ts` | WCAG 2.2 A/AA rules on 18 pages in light, dark and high contrast; skip link; palette; `g` shortcuts; topology keyboard; forced colours; 390 px viewport without horizontal scroll |
| Visual regression | Playwright screenshots | `e2e/visual.spec.ts` | Overview, legacy asset, command review (light and dark), time-dependent regions masked |
| Performance | Playwright | `e2e/performance.spec.ts` | Server-filtered inventory page < 3 s, event log DOM stays virtualised, topology ≤ 300 nodes and < 3 s |

## Running

```sh
pnpm install
pnpm test                                 # all unit/component suites
pnpm --filter @waylorn/web build
pnpm --filter @waylorn/web e2e            # starts the fixture server and `next start` itself
```

Playwright uses its pinned Chromium when installed, or `PW_CHROMIUM_PATH` / a pre-provisioned Chromium otherwise.

## Degraded-connectivity controls

`POST http://localhost:4010/__fixture/control` with any of `{ "stream": "normal" | "frozen" | "severed", "latencyMs": number, "failApi": boolean }`. The E2E suite resets them after each test.

## Visual baselines

Screenshots depend on fonts and rasterisation, so baselines are only valid on the platform that produced them. The committed baselines were generated on Linux with Chromium 141 (the development container). CI currently excludes the visual project; to enable it, regenerate baselines inside the pinned CI image (`pnpm --filter @waylorn/web exec playwright test e2e/visual.spec.ts --update-snapshots`), commit them, and drop the `--grep-invert` in `.github/workflows/ci.yml`.

## Not yet covered

- Contract tests against the real .NET API (it does not exist yet).
- Keycloak realm integration (federation, MFA policy) — the fixture issuer implements the same protocol surface.
- Mobile component tests (need `jest-expo`); the mobile app is type-checked, linted and bundled with Metro in CI.
- Load tests of the BFF under many concurrent SSE clients.
