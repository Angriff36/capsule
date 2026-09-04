# Proposal → event handoff

_Serves JTBD(s):_ Josh — "Turn an accepted proposal into a fully-staffed,
stocked, priced event without re-entering data"; Sales staff — booking locks
the same day the client says yes.

## Job Statement

When a proposal is accepted (digitally or by the operator), creating the event
from it must carry every agreed detail — menu selections with servings,
pricing lines, venue, date/time, headcount, enhancements — into the new event
record, so nothing a client signed is retyped or dropped.

## Acceptance Criteria

- [ ] Creating an event from an accepted proposal copies the proposal's menu
      selections onto the event with their servings intact (verified by a
      runtime proof in `tests/proofs/`)
- [ ] The created event links back to the proposal (and its accepted revision)
      rather than holding loose free-text copies
- [ ] Venue on the created event resolves to the saved Venue record when the
      proposal's venue matches one by name, and the mismatch case is visible
      to the operator instead of silent
- [ ] Date, start time, end time, and headcount arrive on the event as real
      typed fields without the operator re-entering them
- [ ] Enhancements the client accepted appear on the event or on a visible
      event-side record, not only on the proposal
- [ ] An operator can tell, on the event-create screen, exactly which proposal
      values will carry over before committing

## Out of Scope

- Proposal authoring/editing UX — covered by the shipped proposals pages
- Digital signature provider integrations — the acceptance seam exists
- Changing proposal acceptance semantics (what "accepted" means)

## Open Questions

- Comprehensive fix vs incremental seam fix (loop escalations failed 2/3 on
  scope) — plan mode must pick a thin horizontal slice and say so
- Enhancements: event-side representation is an entity vs JSON snapshot —
  pick whichever the existing schema already supports
