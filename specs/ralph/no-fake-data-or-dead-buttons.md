# No fake data, no dead buttons, no half-wired features

_Serves JTBD(s):_ Josh — decisions come from Capsule because Capsule holds the
truth; Kayden and sales staff — every button does what it says.

## Job Statement

Anything shipped in the app must be real end to end: the screen calls a real
command, the write persists, the refresh shows it, and failures say what
happened. Screens that display invented numbers, commands that silently do
nothing, flows that stop halfway, and sample/placeholder data in production
paths all lie to the operator. This spec exists to hunt them down and finish
them — the repo's own "fully wired" bar (specs/capsule-complete-feature-spec §1)
is the definition of done.

Initial offenders verified before the audit (historical starting point; the
active implementation plan records repairs and additional findings):

- Kitchen display batch "complete" records plannedYield as actualYield — the
  production-yield report is built on invented numbers.
- ProposalTemplatesPage calls generated commands with `id` instead of `docId`
  — the documented pattern that silently no-ops.
- Outbound replies to clients save as `queued` forever — no sender exists.
- Pack-list "generate from template" and venue layout revise are non-atomic
  client-side loops — a mid-loop failure leaves half a list.
- Route planner uses a flat 40 km/h guess and calls it an estimate.
- `bun run seed` originally defined the function and exited. The entry point
  is now present, but authentication and placeholder related-record IDs remain
  generator-side blockers (#113: escalate, don't hand-patch).

## Acceptance Criteria

- [x] A sweep (plan mode, read-only subagents) inventories every mock, stub,
      placeholder, sample value, and dead command path reachable in the
      shipped UI, recorded as plan tasks — each becomes "finish it" or "file
      the platform blocker", never left silent
- [x] Kitchen batch completion records the operator-entered completed yield,
      including zero, and the report distinguishes new entered measurements
      from historical rows whose measured provenance cannot be established
- [x] Every generated command call in authored UI passes `docId` where the
      contract requires it (grep-verified pattern check, no silent no-ops)
- [x] A reply to a client from the inbox either sends or shows a visible
      "cannot send — no provider connected" state; nothing sits in `queued`
      silently
- [x] Template-generated lists (pack list, layout) either commit atomically
      or fail loudly with what was created and a way to finish
- [x] Estimates are labeled as estimates everywhere they appear (route
      planner, projected food cost); invented values never render as fact
- [x] Nothing in this spec weakens a guard or policy to make a flow "work"
      (domain-gating-restraint still binds)

## Out of Scope

- `bun run seed` itself — generator-side, issue #113; escalate with a proof
- Provider credentials for real email/SMS delivery — the inbox work ends at
  the honest "cannot send" state until the owner supplies a provider
- Features that were never started — this spec finishes started ones

## Open Questions

- None blocking — plan mode's sweep decides task order
