# Threat model (initial)

Status: design review input, 2026-09-27. Scope covers the site OT agent, site gateway, control plane, identity service, event systems, connectors, storage, and AI gateway. It must be revisited for each real protocol adapter and deployment profile with the asset owner and site safety engineer.

## Assets and adversaries

Protect human safety and process availability first; then integrity of device configuration/commands, asset identity, credentials, site topology, recipes, telemetry, evidence, and business data. Relevant adversaries include Internet attackers, compromised enterprise users, malicious or compromised connectors, supply-chain compromise, malware on an engineering workstation, a hostile device on an OT segment, and a compromised cloud account. Operator error and partial failure are also hazards even without an adversary.

## Trust boundaries and data flows

1. **Industrial network → Rust agent:** device packets and vendor SDK output are untrusted. Parsing must be bounded, fuzzed, isolated, and protocol-aware. Discovery is passive where feasible and rate limited otherwise. Device claims never become authorization grants.
2. **Agent → Go gateway → .NET control plane:** authenticated outbound site connection, per-site identity, scoped routes, message limits, anti-replay, and no arbitrary PLC subnet proxying. WAN loss does not affect local process control.
3. **Human/connector → API:** Keycloak tokens or workload certificates are verified at the API, then tenant/site/zone/asset ABAC and RBAC are enforced in the domain. Authentication alone is insufficient.
4. **Control plane → NATS/Redpanda/storage:** producers and consumers have separate identities and subject/topic ACLs. Messages are untrusted on receipt even from a broker. Durable command state uses transactional persistence and idempotency.
5. **Site → cloud/AI/third parties:** data classification and egress policy decide which fields may leave. External model responses and connector outputs are untrusted suggestions, never command authority.
6. **Build → deployment:** signed artifacts, SBOM, provenance, vulnerability response, and installation policy protect long-lived sites, including disconnected update workflows.

## Principal abuse and failure cases

| Scenario | Impact | Required mitigation / test |
| --- | --- | --- |
| Crafted protocol frame or malicious gateway response | Agent crash or code execution | Length/depth/time bounds, fuzzing, safe Rust, process sandbox, malformed-frame corpus, memory/CPU limits. |
| Spoofed device identity or reused IP | Wrong asset acted upon | Identity confidence and provenance, reconciliation, approval tied to stable asset ID and site/zone, independent on-site recheck. |
| Replay or duplication of a RED command | Physical effect repeated | Signed/authorized command envelope, expiry, monotonic sequence or nonce, idempotency, site-side deduplication and state reconciliation. |
| Stolen credential / overly broad connector scope | Unauthorized access or egress | Short-lived credentials, workload certs, least-privilege ACLs, ABAC, revocation, device posture and origin checks. |
| Compromised cloud service reaches PLC network | Lateral movement | Outbound-only site conduit, allowlisted application messages, no general network tunnel, local command authorization. |
| IdP or policy service unavailable | Fail-open authorization | Reject new AMBER/RED actions; allow only explicitly preapproved, time-bound local observation where safe. |
| NATS/Redpanda backlog or broker loss | Stale commands, data loss | Command expiry, explicit outcomes, local store-and-forward, bounded queues and pressure alarms. Never infer execution from delivery. |
| Audit store full or time source invalid | Unverifiable action | Block consequential operations, alarm, retain bounded emergency diagnostics, verify chain after recovery. |
| AI prompt injection via telemetry/tickets | Tool misuse or data leakage | Data/tool isolation, egress policy, typed allowlisted tools, human review; no physical-process command tool. |
| Malicious update / obsolete vendor SDK | Site compromise | Signed OCI/releases, SBOM and provenance, pinned dependencies, isolated SDK process, staged rollout and rollback. |
| Certificate expiry or clock drift | Site isolation or auth bypass | Rotation overlap, monitoring, explicit fail behavior, offline recovery procedure; never suppress verification silently. |

## Security invariants

- Discovery cannot authorize writes. An unknown asset is read-only at most.
- No LLM or connector directly reaches an industrial command interface.
- Cloud outage cannot stop factory control, and cloud cannot gain unrestricted PLC network access.
- RED actions need fresh named human authorization, site policy, and independent process interlocks.
- Missing authorization, audit durability, time validity, or command state results in denial.
- A broker acknowledgement is not proof of physical outcome.
- Raw sensitive OT information stays local unless a classified egress policy explicitly permits export.

## Open risk decisions

Each site needs a zone/conduit assessment, safety impact analysis for candidate writes, target security levels selected by risk assessment, compensating controls for legacy devices, and a validated recovery plan. Before production, commission independent penetration testing, protocol fuzzing, hardware-in-loop fault tests, and review of on-site fail-safe behavior. Residual risk is accepted by the asset owner, not inferred from this document.
