# ADR 0010: Command safety user experience

Date: 2026-09-27. Status: accepted; execution is disabled by the backend (ADR 0002).

## Decision

- Commands are never one-click. The flow is: choose action → backend **preflight** (policy evaluation, returns safety class, decision, matched policy, and requirements) → review → step-up if required → explicit confirm → submit with idempotency key → track outcome.
- The review shows WHAT, WHERE (org/site/zone/line), TARGET (name, stable ID, kind, manufacturer/model), WHO (principal and IdP), WHY (mandatory reason; change ticket where required), and POLICY (ID, version, rule). The safety class is shown as a text label plus icon plus band, never colour alone.
- RED additionally needs a fresh step-up, typed confirmation of the target's stable identifier, and a confirmation button that is not default-focused. No countdown pressure, no pre-checked boxes, no "don't ask again".
- A submitted command shows "Submitted — outcome not confirmed" until the backend reports a reconciled outcome. Timeout shows **Unknown outcome — reconcile before retrying**. The UI never infers success from HTTP 202.
- The UI does not assign safety classes; it renders the class the backend returns. If the class is missing, the UI treats it as RED.

## Consequences

The flow is slower by design. Usability studies with operators are required before AMBER execution is enabled (implementation plan phase 4).
