# AC-006 create-event carry-over preview — evidence 2026-09-22

Receipt for the PL-BOOKING AC-006 increment on shared `dev`. Worker
`glm-5.3-flash` authored the preview helper, component, page wiring, and
tests. Orchestrator `cursor-grok-4.6-high-fast` chose the increment, read
the diffs, re-ran the proving commands, and wrote this judgment. This is
not a production release.

## Scope

- AC-006 → PASS (P + J). PL-BOOKING stays unchecked. Remaining on that
  task: AC-410 (broader booking identity) and AC-436 (true concurrent
  race). Do not invent a Confirmed stage. Do not change `final`.
- P: `tests/features/events/proposal-event-prefill.test.ts` › "preview
  lists carried values"; `tests/event-create-behavior.test.ts` › "lists
  which proposal values will carry over before create". Orchestrator
  re-ran both files 19/19.
- J: this receipt. `ANTHROPIC_API_KEY` is unset, so `src/lib/llm-review.ts`
  cannot call Anthropic. ACCEPTANCE_TESTS.md allows a human/operator
  judgment. Reviewer: cursor-grok-4.6-high-fast. Date: 2026-09-22.
  Artifact: the rendered carry-over copy from
  `ProposalEventCarryoverPreview` + `ProposalEventPrefill.carryoverPreview`
  (accepted and draft cases below), judged against AUDIENCE_JTBD.md and
  DESIGN.md. Criterion: UX-01 (clear hierarchy, one obvious primary
  action) plus the AC-006 list of eight fields and the linking reason.

## Why this increment exists

Josh's job is to turn an accepted proposal into an event without
re-entering what the client already agreed. The create-event screen used
to dump some proposal facts as loose paragraphs and hid missing ones.
An operator could not see, before committing, the exact set that would
carry and why the event would or would not link. The structured list
makes that decision visible on the same screen as Create event.

## Rendered artifact (accepted, linkable)

Eyebrow: `WILL CARRY OVER`

| Label        | Value                                          |
| ------------ | ---------------------------------------------- |
| Title        | Anniversary dinner                             |
| Type         | dinner                                         |
| Date         | (formatDate of the proposal start)             |
| Times        | Start {start} · End {end}                      |
| Headcount    | 40 guests                                      |
| Venue        | Garden — 100 Oak St                            |
| Menu         | 3 menu selections                              |
| Enhancements | 2 enhancements                                 |

Link reason: `Creating this event links it to the proposal and copies its 3 menu selections onto the event.`

Primary action on the same aside: `Create event` (`btn-primary`, full
width). Already-booked and non-accepted proposals keep their Open event /
Open proposal exits; they do not get a create CTA.

## Rendered artifact (sparse draft)

All eight rows still appear. Missing facts read
`Not on the proposal — set it on the event.` Counts read `None to copy`.
Link reason: `This proposal is draft — only an accepted proposal can be booked into an event.`

## UX-01 / DESIGN.md / AUDIENCE_JTBD.md judgment

1. Hierarchy: short uppercase eyebrow (DESIGN.md allows uppercase for
   eyebrows and operational metadata) → eight labeled rows → quieter
   linking reason (`text-ink-3`) → one primary Create event action.
   Missing values use `text-ink-3` so they do not look like booked facts.
2. One primary action: Create event remains the only `btn-primary` on a
   linkable proposal. Open event is the primary action only when the
   proposal is already booked.
3. Tokens: `text-ink`, `text-ink-2`, `text-ink-3`, `text-sm`, `text-xs`,
   existing `space-y-1.5` / `pt-1`. No new colors, type faces, or radii.
   No nested card chrome beyond the existing `Section`.
4. Honesty: a missing title/type/date/times/headcount/venue is named, not
   invented. Zero menu/enhancement rows say none to copy. Linking reason
   names accepted-and-unlinked vs already-booked vs draft/other status.
5. Josh / sales JTBD: the salesperson can see what will land on the event
   before they press Create event, which is the #141 class of failure
   this spec exists to stop.

VERDICT: PASS
PERCEPTUAL VERDICT: PASS
Feedback: none required. The list is the decision surface; Create event
stays the one commit action.

## What this increment did not do

- No Manifest / generated-file / booking-command change.
- EventCreatePage is still 1152 lines (was 1199). Not split this turn.
- Quoted price is not a listed carry-over row (AC-006 does not name it).
- AC-410 and AC-436 stay PENDING.
- `llm-review.ts` was not executed (no Anthropic key).
