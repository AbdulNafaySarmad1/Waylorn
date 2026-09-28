# ADR 0036: Treat device identification as a reviewed discovery claim

Status: accepted, 2026-09-28

## Context

Assets were entered by hand, and nothing checked them against what a device reports. The architecture treats discovered identifiers as claims until reconciled and forbids merging assets on network address alone. The test plan forbids active probing of customer networks without a site plan.

## Decision

The Rust reader adds Modbus Read Device Identification (function 0x2B, MEI 0x0E, basic stream: vendor name, product code, revision), gated as the GREEN `Identify` operation. It accepts one response containing all three objects, each 1–64 printable ASCII characters without quotes or backslashes. `ot-observe identify <ip:port> <unit>` prints the result. The Go gateway identifies only its configured endpoint, at startup and then hourly, and posts the result to `POST /api/v1/discovery/claims` as the site's `SiteAgent` workload. It never probes other addresses. A failed identification is logged and never blocks polling.

The control plane stores one claim per agent, endpoint, and unit. When the reported identity is new or has changed, the claim returns to `Pending`. It proposes a candidate only when exactly one site asset has the same manufacturer and model, or when the claim was already linked; the network address is never used to choose. Only a human site administrator can reconcile a claim through `POST /api/v1/discovery/claims/{id}/reconcile`, using the claim's current version. `link` attaches it to an existing site asset, `create` makes a new asset, and `reject` dismisses it. Linking or creating copies vendor, product, and revision onto the asset as reviewed facts. Every claim change and reconciliation is audited.

## Consequences

A firmware or product change on a linked device reopens review instead of silently rewriting the inventory. Two identical models at one site always need a human to choose. Modbus basic identification has no serial number, so a claim cannot prove physical identity; replacing a device with an identical model and firmware is not detected. Devices without function 0x2B produce no claim. Identification adds one request per hour, outside the site polling budget. Continuation responses ("more follows"), other protocols, and passive network discovery are not implemented.
