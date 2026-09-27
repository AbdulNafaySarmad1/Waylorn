# IEC 62443 planning map

Status: preliminary engineering traceability, **not** a conformance statement or certification. The normative texts and applicability decisions require licensed review by a qualified assessor. The cited IEC pages describe the scopes of [IEC 62443-4-1:2018](https://webstore.iec.ch/en/publication/33615), [IEC 62443-4-2:2019](https://webstore.iec.ch/en/publication/34421), and [IEC 62443-3-3:2013](https://webstore.iec.ch/en/publication/7033). This map uses their published seven foundational requirements and lifecycle scope; it does not reproduce or assert coverage of individual normative clauses. Target security levels must be set by a site-specific risk assessment.

| Standard / area | Planned control and evidence | Present status |
| --- | --- | --- |
| 4-1 secure requirements and design | Security requirements, ADRs, threat models, trust boundaries, site safety assumptions, traceable acceptance criteria | Initial documents only |
| 4-1 secure implementation | Coding rules, review, isolated FFI, pinned dependencies, signed builds, SBOM | Not implemented |
| 4-1 verification/validation | Unit, fuzz, integration, failure, penetration, and HIL testing with retained results | Gate unit tests type-checked; not executed here |
| 4-1 defect, patch, end-of-life management | Vulnerability intake, severity and remediation policy, offline update path, support lifecycle | Not implemented |
| 4-2 component identification/authentication (IAC) | Device/workload identity, Keycloak federation, certificates, short-lived credentials | Not implemented |
| 4-2 use control (UC) | RBAC+ABAC, explicit capability declaration, human approval and audit for consequential actions | Rust non-GREEN denial only; no production auth |
| 4-2 system integrity (SI) | Signed releases, parser hardening, config integrity, tamper-evident evidence | Not implemented |
| 4-2 data confidentiality (DC) | Local-first classification, encryption, approved egress | Not implemented |
| 4-2 restricted data flow (RDF) | Zones/conduits, outbound site tunnel, no direct cloud/PLC routing | Design only |
| 4-2 timely response to events (TRE) | Audit, health, alert routing, incident runbooks | Design only |
| 4-2 resource availability (RA) | Bounded queues, local autonomy, fail-safe operation, recovery drills | Design only |
| 3-3 system IAC/UC | End-to-end identity and authorization across site and cloud | Design only |
| 3-3 system SI/DC/RDF | Trust-boundary protections, network segmentation, data lifecycle | Design only |
| 3-3 system TRE/RA | Monitoring, evidence, resilience, disaster recovery | Design only |

For each future release, record applicable requirement ID and enhancement, component/system scope, target level, design link, test/evidence link, deviation or compensating control, owner, and assessor sign-off. Legacy equipment may require compensating controls instead of unsupported native capabilities. No security level or certification is claimed here.

## Operator console (web and mobile clients), 2026-09-27

Same caveat: planning traceability only. Evidence links point to code and tests in this repository.

| Area | Client-side control | Evidence | Status |
| --- | --- | --- | --- |
| 4-1 secure implementation | Strict TypeScript, no `any`, type-aware lint, pinned dependencies, frozen lockfile, install-script allowlist, audit gate in CI | `eslint.config.mjs`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `docs/frontend/dependencies.md` | Implemented; signing/SBOM pending release pipeline |
| 4-1 verification | Unit, component, accessibility, E2E, degraded-connectivity, visual and performance tests | `docs/frontend/testing.md` | Implemented against fixtures; no backend integration tests yet |
| IAC (human users) | OIDC Authorization Code + PKCE via Keycloak; tokens held server-side (web) or in the platform keystore (mobile); step-up with `max_age=0` and ACR for consequential actions | ADR 0008, `apps/web/src/server/auth/*`, `apps/mobile/src/auth.tsx`, `e2e/commands.spec.ts` | Implemented against the development issuer; Keycloak realm not yet provisioned |
| UC (use control) | UI never authoritative: actions are shown with backend-computed availability and reasons; the backend re-evaluates every request; RED requires typed target confirmation and fresh step-up | ADR 0010, `test/command-launcher.test.tsx`, `e2e/commands.spec.ts` | Implemented; execution disabled by backend |
| SI (integrity) | Nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, no inline script, CSRF (Fetch Metadata + session-bound token), safe redirects, BFF path allowlist | `apps/web/src/lib/csp.ts`, `apps/web/src/proxy.ts`, `test/server.test.ts`, `e2e/auth.spec.ts` | Implemented |
| DC (confidentiality) | No tokens or operational data in browser storage; `__Host-` HttpOnly cookies; `Referrer-Policy: no-referrer`; AI egress disclosed before sending | `apps/web/src/lib/cookies.ts`, `components/ai/Assistant.tsx` | Implemented |
| TRE (response to events) | Audit search with actor, IdP, decision, policy, result, correlation ID; command outcomes tracked until reconciled | `app/o/[org]/audit`, `components/audit/AuditTable.tsx` | Implemented against draft contract |
| RA (availability) | Stale/unknown presentation on stream loss, bounded client memory (topology, events, telemetry), error states with correlation IDs; the console failing never affects site operation | ADR 0009, ADR 0011, `e2e/degraded.spec.ts` | Implemented |
