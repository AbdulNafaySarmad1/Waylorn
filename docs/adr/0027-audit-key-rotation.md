# ADR 0027: Verify historical audit records across signing-key rotation

Status: accepted, 2026-09-28

## Context

Individual audit records carry an HMAC tag and key ID. Previously the process held only the active signing key, so replacing that key made all earlier records `unverified` even if their original key had been retained securely.

## Decision

`Audit:KeyId` and `Audit:SigningKey` remain the sole active signing pair. Optional `Audit:VerificationKeys:<keyId>` entries supply historical keys for verification only. Startup validates every ID and key, rejects an active ID repeated in the historical set, and still requires an active signing pair outside Development. Verification selects the key named on the stored record; new records are always signed with the active key.

## Consequences

Operators can rotate the signing key without losing verification of earlier rows, provided historical keys remain available through secret management. Removing a historical key makes its records `unverified`; supplying the wrong key makes their tags `broken`. Historical keys must be protected as carefully as the active key, since a holder can forge old-key tags. This does not add row-deletion detection or immutable retention.
