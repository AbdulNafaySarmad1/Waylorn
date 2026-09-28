# ADR 0032: Require strong authentication for AMBER approval

Status: accepted, 2026-09-28

## Context

The approval endpoint required a separate human `Approver`, change ticket, and active window, but did not use the authentication-strength claim already checked elsewhere in the access policy. A password-only or otherwise weak session could approve a consequential administrative request.

## Decision

Require an `amr` claim of `mfa`, `otp`, or `webauthn` for approval. A missing or different method denies the mutation and writes the existing denial audit record. A site-scoped human Approver can still read a command to begin a step-up flow. The Keycloak realm or federated identity provider must issue the method claim from a verified authentication flow; a role alone is insufficient. The API still does not dispatch approved commands to a site agent.

## Consequences

Deployments must map and test authentication-method claims in Keycloak before enabling approval workflows. Existing human tokens without qualifying `amr` are denied. Recent-authentication age and device posture are separate policy work; this change does not imply that MFA alone makes any OT command safe to execute.

The local realm now issues this evidence from a real second factor. The bootstrap adds Keycloak's AMR mapper to the API and web clients and sets authentication references (`pwd`, `otp`) on the password and OTP steps of the direct-grant and browser flows; Keycloak emits `amr` only for steps that actually ran. `waylorn-approver` has a TOTP credential, so Keycloak refuses its password alone, and its tokens carry `amr: ["pwd","otp"]`. `waylorn-password-approver` has no second factor. The smoke test proves that a password-only approver is denied and the command stays pending, and that the TOTP approver's approval is recorded. The TOTP secret is seeded from the ignored `.env` so the smoke test can compute codes; a production realm must let each approver enrol their own authenticator.
