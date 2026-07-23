# Findings: Recurring Event Scheduling

- Event lifecycle and creation are generated-first from `src/operations/event.manifest`.
- Manifest 3.6.41 can emit static Convex schedule calls, but cannot securely enumerate tenant-scoped Event sources or inject a trusted system identity into generated commands.
- A per-series durable Convex scheduler is therefore the narrow internal projection-gap bridge; the upstream limitation is documented in issue #74.
- Generated instances use Event's `planning` stage, presented as Draft, and retain source Event, series, and occurrence-sequence lineage.
- Calendar dates are anchored to the source Event so month-end clamping does not accumulate drift.
- Draft generation is bounded to 90 days and 24 records per transaction; stale jobs exit when their series token no longer matches.

