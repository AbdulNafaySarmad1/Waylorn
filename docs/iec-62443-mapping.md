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
