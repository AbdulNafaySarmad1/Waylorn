# ADR 0009: Keycloak OIDC through a backend-for-frontend

Date: 2026-09-27. Status: accepted.

## Context

Identity is federated through Keycloak (Entra ID, AD/LDAP via user federation, SAML IdPs, MFA). Browser-held tokens are exposed to XSS and third-party script compromise. Consequential operations need step-up authentication.

## Decision

- The Next.js server is a confidential OIDC client (`openid-client`), Authorization Code + PKCE + `state` + `nonce`. Federation, MFA and IdP selection are Keycloak concerns; the web tier only sees Keycloak.
- Tokens are held server-side in a `SessionStore`. The browser receives an opaque random session ID in a `__Host-waylorn-session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`). The in-memory store is development-only; production startup fails unless a shared store is configured (Valkey adapter is F1 work).
- Session lifecycle: access token refreshed server-side before expiry; refresh failure ends the session and redirects to login with a safe `returnTo`. Idle and absolute session limits are enforced by the BFF and displayed to the operator ahead of expiry. Logout uses RP-initiated logout at Keycloak and destroys the server session.
- Step-up: the BFF redirects with `max_age=0` and a configured `acr_values` (e.g. `urn:waylorn:acr:mfa-recent`). The resulting `auth_time`/`acr` are recorded in the session and sent to the backend, which decides whether they satisfy policy.
- Organization switching re-scopes the session to an organization the backend lists for the principal; it does not mint new identity. Account switching is logout + login with `prompt=select_account`.
- Authorization: the frontend never treats `permittedActions` or roles in tokens as authoritative. The UI hides or disables actions for usability and always explains why; the backend re-evaluates RBAC + ABAC per request.

## Consequences

The web tier becomes stateful (session store). Horizontal scaling needs the shared store. XSS cannot exfiltrate tokens, though it could still act within a session, which CSP and CSRF controls reduce.
