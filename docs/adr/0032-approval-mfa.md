# ADR 0032: Require strong authentication for AMBER approval

Status: accepted, 2026-09-28

## Context

The approval endpoint required a separate human `Approver`, change ticket, and active window, but did not use the authentication-strength claim already checked elsewhere in the access policy. A password-only or otherwise weak session could approve a consequential administrative request.

## Decision

Require an `amr` claim of `mfa`, `otp`, or `webauthn` for approval. A missing or different method denies the mutation and writes the existing denial audit record. A site-scoped human Approver can still read a command to begin a step-up flow. The Keycloak realm or federated identity provider must issue the method claim from a verified authentication flow; a role alone is insufficient. The API still does not dispatch approved commands to a site agent.

## Consequences

Deployments must map and test authentication-method claims in Keycloak before enabling approval workflows. Existing human tokens without qualifying `amr` are denied. Recent-authentication age and device posture are separate policy work; this change does not imply that MFA alone makes any OT command safe to execute.

The local password-grant smoke test now asserts the approval is denied and the command remains pending. Its fixture realm does not manufacture MFA evidence; an end-to-end approval test needs a real MFA-enabled human login flow.
