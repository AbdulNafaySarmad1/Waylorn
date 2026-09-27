# ADR 0005: Common artifacts and site autonomy

Date: 2026-09-27. Status: accepted as deployment target; no installer exists.

## Decision

Package signed OCI artifacts for managed SaaS, customer cloud, hybrid, on-premises, and air-gapped installations where practical. RHEL with SELinux enforcing is the reference environment. Use Podman for supported smaller sites and Kubernetes where orchestration has a demonstrated need. Establish site connections outbound; cloud services cannot route freely to PLC networks. Keep OT agents local and statically placed by site engineering.

## Consequences

Air-gapped updates need offline signature, SBOM, and provenance verification. Local services need backup, restore, certificate rotation, and disk-pressure runbooks. KEDA may scale appropriate application workers but never safety-sensitive OT processes in reaction to queue depth.
