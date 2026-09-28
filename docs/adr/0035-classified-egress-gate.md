# ADR 0035: Gate every egress on a classified, default-deny policy

Status: accepted, 2026-09-28

## Context

ADR 0004 requires a versioned classification and egress policy in front of every external destination, and the threat model keeps raw OT data local unless such a policy explicitly permits export. No policy engine existed, so the first exporter or AI gateway would have had nothing to ask. The draft frontend contract already describes providers, per-provider data policies, and an egress log.

## Decision

Classification v1 is fixed in code (`EgressGate.Classify`): raw telemetry, PLC configuration, and recipes are `restricted`; topology, network details, security events, personal data, and audit records are `confidential`; asset inventory, telemetry aggregates, maintenance records, and reliability metrics are `internal`. Changing it is a reviewed code change.

An organization-wide administrator with a second factor registers a destination (`POST /api/v1/egress/destinations`) with a locality and classification ceiling. External and customer-cloud destinations require HTTPS. Each destination starts with a deny-all policy that requires approval. The policy uses the contract's `AiDataPolicyUpdate` shape and changes only through `PUT /api/v0/orgs/{orgId}/ai/policies/{policyId}` with `If-Match`, under the same authority. Both changes are audited.

A sender asks `POST /api/v1/egress/decisions` before any transfer. The data is blocked if the destination is unknown or disabled, if it has no policy, if a category is prohibited or not explicitly allowed, or if any category is classified above the destination's ceiling. If the policy requires approval, the decision is `pending_approval`. Otherwise it is `allowed`, and the response carries the redaction, pseudonymization, and aggregation obligations the sender must apply. Every decision is stored as an egress record and audit entry, including blocked ones, and is listed at `GET /api/v0/orgs/{orgId}/ai/egress`.

## Consequences

Restricted data can leave only through a destination whose ceiling was deliberately raised to `restricted` and whose policy names the category. The API performs no egress and cannot see what a sender actually transmits. Enforcement depends on every exporter and the future AI gateway calling the gate and honouring its obligations. Network egress controls must block direct paths that bypass it. There is no workflow yet to resolve `pending_approval`, so such data is not sent. The gate does not inspect payloads for DLP; that remains the gateway's job.
