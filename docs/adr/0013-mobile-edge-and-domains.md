# ADR 0013: Mobile scope, edge protection and custom domains in the client

Date: 2026-09-27. Status: accepted.

## Decision

- **Mobile** (Expo / React Native) covers alerts, approvals review, incident review, asset lookup, maintenance tasks and health checks. It does not expose topology editing, policy authoring, AI governance, or command initiation. Approvals on mobile are read-and-route until device-bound step-up is designed (F3). Tokens are stored with `expo-secure-store`; OIDC via system browser (`expo-auth-session`, PKCE).
- **Edge**: the web tier is edge-agnostic. It trusts `X-Forwarded-*` only from configured proxy ranges, and emits the same security headers regardless of edge. Human-verification challenges (Turnstile or equivalent) belong in the Keycloak login theme; BFF, API, SSE and all machine or OT paths never carry web challenges.
- **Custom domains**: the web app derives its public origin from configuration, not the `Host` header. Domain provisioning (request → DNS verification → certificate → ingress binding → Keycloak redirect registration → activation) is a backend workflow; the UI renders its state machine and never marks a step complete without backend confirmation.

## Consequences

Mobile stays small and reviewable. Custom domains require the Keycloak client's redirect URIs to be updated per domain, which is a backend step with its own audit record.
