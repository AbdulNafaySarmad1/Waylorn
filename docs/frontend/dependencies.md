# Frontend dependency register

Exact versions are pinned in each `package.json` and `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` is enforced in CI. Only `esbuild`, `sharp` and `unrs-resolver` may run install scripts; `protobufjs` (via OpenTelemetry) is explicitly not allowed to.

| Dependency | Where | Why | Notes |
| --- | --- | --- | --- |
| next 16, react 19 | web | App Router, Server Components, Node proxy for CSP | Standalone output for OCI images |
| openid-client 6 | web (server) | Certified OIDC RP; PKCE, nonce, `max_age`, RP-initiated logout | Only runs server-side |
| openapi-typescript 7, openapi-fetch 0.17 | contracts | Generated types and typed client (ADR 0008) | Generated output committed |
| @tanstack/react-virtual 3 | web | Event log virtualisation | Headless |
| @opentelemetry/* | web | Server (NodeSDK) and opt-in browser tracing | Exporters only when configured |
| jose 6 | fixtures | Development issuer token signing | Dev/test only |
| expo 57, expo-router, expo-auth-session, expo-secure-store | mobile | Native app, PKCE sign-in, keystore storage | React 19.2.3 / RN 0.86 as pinned by Expo SDK 57 |
| vitest, @testing-library/*, axe-core, @axe-core/playwright, @playwright/test | tests | See testing.md | Dev only |
| typescript 6.0 | all | Pinned below 7.x until typescript-eslint and Next.js support the native compiler | |
| eslint 9 | all | `eslint-plugin-jsx-a11y` does not support ESLint 10 yet | |

No UI component library, CSS framework, charting library or hosted fonts are used (ADR 0007).

## Known advisories (2026-09-27)

`pnpm audit` reports two **moderate** advisories, both in the Expo mobile toolchain; CI fails on high or critical.

| Package | Path | Exposure | Action |
| --- | --- | --- | --- |
| uuid < 11.1.1 | expo › @expo/config-plugins › xcode › uuid | Build-time iOS project generation only; not shipped in the app bundle | Track Expo SDK update |
| decode-uri-component ≤ 0.4.2 | expo-router › query-string | Client-side DoS on crafted deep-link query strings in the mobile app | Track expo-router update; deep links are limited to `waylorn://` routes |
