# ADR 0022: Sign individual audit records with an external key

Status: accepted, 2026-09-28

## Context

Audit records and their Redpanda outbox events are stored in PostgreSQL. A database-only edit could change a stored record without a visible signal. The pilot has no immutable storage, trusted timestamp service, or cross-record chain.

## Decision

Each new audit record can carry an HMAC-SHA256 tag over a fixed canonical representation of its identity, tenant/site, actor, action, target, outcome, and UTC timestamp. The signing key comes from `Audit:SigningKey` outside PostgreSQL; `Audit:KeyId` identifies it. A non-Development process fails startup without both. The tag and key ID are stored with the row and emitted in the audit event. An administrator can verify an individual row through `/api/v1/audit/{id}/verify`. A missing signature or unavailable historical key reports `unverified`; a mismatched tag reports `broken`. Existing rows are left unsigned rather than inventing historical evidence.

## Consequences

This detects a modified signed row when the attacker cannot access the signing key. It does not detect row deletion, prove completeness or ordering, or replace immutable external retention. The same key ID and key must be retained to verify historical rows; rotating keys requires a verification and archival plan. Operators should alert on `broken` and unexpected `unverified` states. A later evidence pipeline must add chain/manifest anchoring and immutable storage before claiming comprehensive tamper evidence.
