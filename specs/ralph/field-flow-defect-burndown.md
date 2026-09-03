# Field-flow defect burndown (UI audit #142–#151)

_Serves JTBD(s):_ Kayden — "know what to do next from a phone" and "clock in
without fighting the form"; Josh — nothing falls out of the app mid-service.

## Job Statement

Close out the remaining audited field-flow defects — pack-list error
dead-ends, equipment/reservation dead-ends, dish tags discarded on copy,
event-scope food-cost gaps, time records not linked to their event, date
field mangling, and the unconstrained stock unit picker — so the field
experience has no known dead ends. Each defect is a small, independently
verifiable fix; the burndown is one queue.

## Acceptance Criteria

- [ ] Every open #142–#151 issue is either fixed with a regression test or
      escalated to its own GitHub issue with the platform/product blocker
      named (no silent skips; `bun run test` green throughout)
- [ ] Pack-list row failures show a per-row, actionable error and the row
      remains retryable without re-adding it
- [ ] Equipment reserve/checkout dead-ends end in an explainable state
      (why unavailable, what to do next), never a silent no-op button
- [ ] Copying a dish or menu preserves its tags
- [ ] Time records created from clock-in carry the event link when a covering
      or same-day shift exists
- [ ] Date inputs cannot mangle a typed date (year stays 4-digit, value
      survives blur) — extends the existing BoundedDateInputs guard
- [ ] The stock unit picker only offers units compatible with the item's
      catalog unit

## Out of Scope

- Platform-level fixes (Manifest/Builder bugs) — escalate, don't work around
- New features beyond restoring the audited flows

## Open Questions

- None — issues #142–#151 already carry the repro steps
