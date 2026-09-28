# ADR 0028: Enforce one site per observation workload token

Status: accepted, 2026-09-28

## Context

The site heartbeat endpoint required a `SiteAgent` workload token with exactly one matching `site_id`, but observation ingestion accepted a matching claim even if the same token carried additional site claims. That contradicted the single-site credential contract and widened the effect of a compromised agent credential.

## Decision

Observation ingestion now requires exactly one parseable `site_id` matching the batch site, a nonempty bounded subject, the `SiteAgent` role, and `principal_type=workload`, consistent with heartbeat authorization. A PostgreSQL unique-constraint violation is still reported as a duplicate request conflict; other database write failures surface as failures instead of being mislabeled as conflicts.

## Consequences

Agents with multi-site or wildcard credentials can no longer submit observations and must use a separate scoped identity for each site. The API still checks the tenant-owned industrial asset and its site before storing values. This change does not establish hardware identity or prove that a reported Modbus register is physically trustworthy.
