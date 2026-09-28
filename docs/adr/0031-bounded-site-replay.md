# ADR 0031: Bound site observation replay per poll cycle

Status: accepted, 2026-09-28

## Context

After an offline period, the gateway could attempt to send its entire 10,000-file spool in one polling cycle. Even with a responsive API, that could delay the next device read and site heartbeat for minutes. The cycle also sent a heartbeat twice after a successful read.

## Decision

Drain at most 50 queued observations before a read and 50 after it, with a five-second deadline for each drain. Retain unsent files for later cycles and continue polling under the existing spool cap. Send one heartbeat after each cycle regardless of read or replay error. Enumerate only regular `.json` files for replay and heartbeat depth; symlinks are not replayed.

ADR 0033 expands heartbeat depth and the spool cap to include regular files in the rejected directory and incomplete temporary files. Replay remains limited to regular `.json` files in the active spool.

## Consequences

A long backlog clears over multiple cycles while the gateway continues to report its queue depth. Slow API requests cannot occupy replay indefinitely. A site still needs a poll interval and spool capacity sized for its expected outage, traffic, and API rate limit. The spool is not a substitute for redundant durable storage, and a local administrator must investigate files that cannot be replayed.
