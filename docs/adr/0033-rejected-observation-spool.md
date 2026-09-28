# ADR 0033: Preserve permanently rejected observations outside the replay queue

Status: accepted, 2026-09-28

## Context

A single observation that the API permanently rejects blocks replay of every later batch when the gateway always starts with the oldest file. Retrying a 400, 404, 409, 413, or 422 cannot repair that file without operator action or a registry change. Discarding it would erase evidence of a data or contract problem.

## Decision

On those response codes, move the file into a local `rejected` subdirectory, report an error, and continue with the next queued file on the following cycle. The directory must be a real directory, not a symlink. Keep both active and rejected regular files in the 10,000-file capacity and heartbeat spool depth. Other failures, including identity errors, rate limiting, server errors, and network outages, keep the file in active replay. The gateway never treats a rejection as an acknowledgement.

## Consequences

Later valid observations can catch up while rejected batches remain for inspection and controlled requeue. Operators need an alert on gateway errors or nonzero spool depth, and must inspect the API rejection before moving a file back to the active spool. A full rejected queue stops new polling rather than silently dropping observations. This does not implement automatic correction or permanent archival of rejected batches.
