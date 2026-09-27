# ADR 0020: Keep pilot raw observations on the site host

Status: accepted, 2026-09-28

## Context

The first Go gateway spools read-only Modbus observations and sends them to a configured HTTPS API. That URL could point outside the site, contradicting the local-first treatment of raw industrial telemetry. The pilot has no administrator-controlled data classification, destination grant, redaction, or aggregate export path.

## Decision

The pilot gateway accepts only a numeric loopback IP address for `WAYLORN_API_URL`. Plain HTTP still requires the existing explicit loopback development switch. The .NET observation API remains disabled unless a site-local deployment opts in with `Telemetry__AcceptRawObservations=true`. The gateway still uses its scoped workload identity and local spool. No remote raw telemetry mode exists in this binary.

## Consequences

The current simulator can run with a site-local API on the same host. A separate-host site deployment needs a new authenticated local transport design and proof that the receiving host is within the authorized site boundary. Cloud analytics must use a classified, explicitly granted and transformed egress path; this pilot cannot be repurposed for it by changing a URL.
