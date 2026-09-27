# ADR 0004: Local-first sensitive data and single AI gateway

Date: 2026-09-27. Status: accepted as trust-boundary constraint; policy engine not implemented.

## Decision

Raw industrial telemetry, PLC configurations, recipes, sensitive logs, network details, and security data remain on premises by default. A versioned data-classification and egress policy controls every external destination, including cloud analytics, integrations, observability, and model providers. All application model traffic passes through one AI gateway that applies policy, redaction/pseudonymization, aggregation, DLP, and approval where required. Local providers must obey the same tool permissions even when no external egress occurs.

## Consequences

Cloud features may have less data than local features. An unavailable egress policy service denies export and does not disable local factory operation. Provider neutrality requires contract tests but does not justify building every adapter before demand.
