# ADR 0018: Deny RED command records until a site safety case exists

Status: accepted, 2026-09-28

## Context

The first command workflow stores requests and approvals but has no site-side capability evidence, hazard review, dispatch, acknowledgement, or physical outcome. An earlier generic risk mapping allowed a RED `Write` record to be requested and, with an MFA claim, approved. That record could be mistaken for authorization to act on equipment.

## Decision

The current API accepts only AMBER administrative request records. `Write` is RED. `ChangeConfiguration` for industrial, network, and security assets is also RED because it can affect plant operation. RED requests return a policy denial and write an audit record. Existing RED records cannot transition to approved state. GREEN operations remain read-only and do not enter the approval workflow. No approval event is an executable command.

## Consequences

Compute, cloud, storage, and application asset configuration requests can use the AMBER record workflow with a ticket, bounded window, separate human approver, idempotency key, and audit. This classification does not prove that a specific asset supports the operation; there is still no dispatch. RED support requires an asset-specific capability claim, site safety case, human and site-side authorization, HIL testing, and a separate release gate before any API accepts it.
