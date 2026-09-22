# PL-BOOKING proposal-route booking-UI increment evidence — 2026-09-22

Receipt for the AC-411 booking-UI increment on shared `dev` (issue #392).
Documentation only here. `EventCreatePage` used to generic-create an unlinked
Event for loading, missing, draft and already-linked proposal routes; now only
no-proposal routes offer generic creation, accepted-unlinked proposals book
through the existing canonical seam with the returned Event id, and every
proposal context shows a truthful next step. Worker `glm-5.3-flash` authored
code/tests; orchestrator `gpt-6-astra` chose the fix, read the diffs and
independently ran the commands. Review APPROVE covers this increment only, not
all `dev` history.

## Scope and status

- AC-411 → PASS. All other criterion statuses are unchanged: 53 PASS /
  674 PENDING of 727 total. PL-BOOKING stays unchecked. AC-006 (J review),
  AC-100, AC-398, AC-410, AC-415, AC-436, AC-437 stay PENDING; historical
  PENDING criteria are unchanged. Full delivery is NOT complete.
- Source-inspection issue [#393](https://github.com/Angriff36/capsule/issues/393)
  (`ProposalEventPrefill.matchVenue` picks the first name match, so
  duplicate-name active venues silently auto-select one) stays open under
  AC-410 — not browser-reproduced and not fixed by this increment. The
  lifecycle `final` meaning ambiguity stays unresolved.
- This receipt records pre-commit local validation. Git commit/push/tag, CI,
  production release, live booking writes, real OCC concurrency and the full
  booking UX/J pass are separate evidence and are NOT claimed here.

## What changed and why it matters

- `src/features/events/EventCreatePage.tsx`: the `proposalLinkable` ternary no
  longer generic-creates an unlinked Event from proposal-routed contexts.
  Generic creation belongs only to no-proposal routes; accepted-unlinked uses
  the existing canonical seam and its returned Event id; a live linked proposal
  offers one primary Open event action; loading, missing, draft, nonaccepted
  and stale soft-deleted contexts expose the correct next step with no create
  CTA; a seam failure keeps the entered details and never generic-falls back.
- After review round 1, the unmatched-venue "pick or create it in the Venue
  panel" hint is gated on `proposalLinkable`: that create-form panel cannot
  attach a venue to an already saved Event, so the old hint invited an orphan
  venue record. No catalog action was disabled and no design token changed.
- UI-only: no backend, Manifest or design-token changes. The existing backend
  suites (persistence, menu copy, replay) are retained and unchanged.

## Review rounds (honest record)

1. First corrected increment PASSED gates, but the first independent review
   (`review-1-verdict.txt`, gpt-5.6-sol, REJECT) found one real UX defect: the
   linked-proposal branch still showed the ineffective venue-reconciliation
   instruction. Earlier the orchestrator had also rejected the first worker
   pass — its tests passed but left an enabled no-op Create event action in
   unavailable contexts; the orchestrator required direct valid-form submit
   tests, true link-click navigation, a stale-deleted context, and a
   consolidated duplicate response-ID case. Not all initial worker cases were
   invalid: worker 217 had already fixed client/venue selection before RED.
2. Worker 226 made the narrow gating correction with new mounted proofs; the
   second fresh review (`review-verdict.txt`, gpt-5.6-sol, 2026-09-22) ends
   `VERDICT: APPROVE` and `PERCEPTUAL VERDICT: PASS`, scoped to this increment
   (no shared history, live booking, concurrency or full AC-006 J). DESIGN.md
   was read in full; no introduced violations; all five scoped file hashes
   verified.

## Test evidence

- `tests/event-create-behavior.test.ts` — 14 mounted real-page tests
  (original 3 retained). The 11 proposal cases cover: canonical-seam booking
  with navigation to the returned Event, retained venue hint plus real picked
  venue on accepted-unlinked, Open-event navigation and no-write/no-create
  handling for already-linked, draft event-first, loading, missing,
  soft-deleted and nonaccepted contexts, and retained entered details when
  the seam rejects. Interaction split: the already-linked, draft event-first,
  loading and nonaccepted negative handler cases submit a valid form
  directly; the accepted-unlinked booking cases click Create event, and the
  already-linked and draft navigation cases use real Open-event link clicks.
  In the rejection case the canonical seam is invoked exactly once with a
  rejecting mock, and the test asserts the generic create command is never
  called while the entered fields stay on screen — it does not prove real
  persistence and does not claim zero seam invocations. These prove page
  payload, navigation and no-write handling — not real concurrency and not
  real booking writes.
- Source review (complement, not substitute): `EventCreatePage` +
  `useCreateEventFromProposal` is the only proposal-routed UI creation path.
  `quoteBuilder` creates the Event before a proposal exists and links
  canonically before completion (real retry suite retained). Standalone event
  import, assistant `Event.planEngagement`, recurring and seed paths are not
  proposal-booking alternatives.

## Gate runs (logs under `.artifacts/iteration-booking-ui/`)

| Run | Result | Proof |
| --- | ------ | ----- |
| `red.log` | RED | 11 tests: 5 failed / 6 passed; the loading valid-form case called generic create once. |
| `focused-first.log` | PASS (pre-correction) | 6 files / 50 tests, before the requested UI/test correction. Superseded by the final logs. |
| `focused-final.log` | PASS exit 0 | Focused: 6 files / 53 tests. |
| `test-final.log` | PASS exit 0 | Full `bun run test`: 197 files / 929 tests. |
| `check.log` | PASS exit 0 | Full `bun run check`: typecheck, format, design, ownership, nine domain guards, secrets, coverage (197/929), Vite build (existing chunk-size warning only) and `baseline-decay: ok`; ends `GATE_EXIT=0`. Began at shared HEAD `3a4217c6` and completed with shared HEAD `a8a2d0c8` — shared history advanced while it ran, and this increment's code/test/spec diff was unchanged throughout — over the working diff — local dirty-working-tree evidence, NOT CI or clean-commit validation. |
| `release-test-orchestrator.log` | PASS exit 0 | 5/5 after the concurrent owner commit `d2268d29` changed the release-review argv. That correction is already in shared commit `3a4217c6`; the test file is NOT part of this increment's diff and its approval is not claimed here. |
| `review-verdict.txt` | APPROVE | Ends `VERDICT: APPROVE`, `PERCEPTUAL VERDICT: PASS` (gpt-5.6-sol). |

Maintenance notes, recorded honestly: the user-owned `loop-ledger.json` was
whitespace-normalized with strict `JSON.stringify(JSON.parse(before))`
equality proven (`ledger-before-format.json`); it stays unstaged.
`startup-preservation-check.json` shows every startup path present; `STATE.md`
and `loop-run-log.md` changed concurrently and remain untouched and unstaged —
all startup bytes are NOT claimed unchanged. No dependencies changed.

## Source identity and shared history

- Work started at `8b02c60d` (required upstream
  `89262916f59e32dbed5d63749999309a62586742` already ancestral;
  `git pull --no-rebase origin dev` up to date). The final gate began at HEAD
  `3a4217c6` and completed with shared HEAD `a8a2d0c8` over this increment's
  working diff; the code/test/spec diff was unchanged throughout the run, so
  this is dirty-working-tree local evidence, not exact clean-commit proof.
- Receipt maintenance note: after validation, the orchestrator ran
  `git pull --no-rebase origin dev`, which fast-forwarded `dev` to `f0e4d74b`
  after `git diff HEAD origin/dev` proved empty (same file tree; no source
  diff changed). The branch is still `dev`. The unrelated release in that
  shared history is NOT claimed as work of this iteration.
- Concurrent shared commits landed during the window and are preserved, NOT
  authored or independently approved by this increment: `292b0fae` (backend
  replay cancellation + import retry scope), `732ac7aa`, `d2268d29`,
  `3a4217c6`, `27d6cc69`, `5b221be2`, `a8a2d0c8`. Stale spec status notes were
  reconciled without changing any normative requirement; acceptance rows
  remain the authority.
- No commit/push/tag, CI run or production release belongs to this receipt.

## Preview and browser evidence (local, read-only)

- Preview `http://127.0.0.1:7813` re-verified after the final build by the
  repeatable `powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813`
  check (already in `.ralph.env`): served `main.tsx` points at
  `http://127.0.0.1:3210` and the port-3210 backend (PID 55244, parent 55200,
  `--local-storage` at this checkout's `.convex/local/default`) answered
  `authStatus:getAuthStatus`. No instance secrets are recorded here.
- Authenticated read-only browser pass: final screenshots
  `output/playwright/booking-ui/linked-desktop.png` and
  `linked-mobile-action.png` (pre-correction copies kept as
  `review-1-linked-*.png`); measurements `mobile-metrics-final.txt`
  (Open event action 40px at 360px viewport, root font 14px, no horizontal
  overflow, `misleadingVenueHint: false`) and `open-event-click.txt` (a real
  click on Open event reached the existing Event). No business records were
  created; no live booking write is claimed.
- Limit: every local proposal was already linked, so screenshots qualify the
  linked-draft UI only. Broader rem-based control sizes remain unqualified
  under PL-MOBILE; this is not a mobile-completion claim.

## Criterion outcome

- AC-411 → PASS: the UI side of the canonical booking boundary is closed —
  mounted tests prove each proposal route's payload, navigation or refusal,
  and the source review confirms no other proposal-routed creation path.
  Backend legs (persistence, menu copy, replay) stay proven by the retained
  runtime suites.
- Remaining on PL-BOOKING: projection agreement, race non-duplication,
  venue mismatch visibility plus issue #393 (AC-410), and the AC-006 J review.
  Real OCC concurrency, the full booking UX/J pass and whole-delivery
  qualification are NOT established by this increment.
