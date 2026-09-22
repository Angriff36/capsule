# PL-BOOKING quote retry-link increment evidence — 2026-09-21

Receipt for the quote-conversion retry-link increment on shared `dev`
(issue #391). Documentation only here. A retry that reused a saved unlinked
draft proposal could complete quote conversion and then book a second Event at
acceptance. The canonical link now runs before conversion completes; a missing
Event checkpoint recovers the saved proposal's event before any create.
Worker `glm-5.3-flash` authored code/tests; orchestrator `gpt-6-astra` read all
diffs and independently ran the proving commands. Review APPROVE covers this
increment only, not all `dev` history.

## Scope and status

- AC-412 and AC-433 → PASS. AC-413, AC-434, AC-414 and AC-435 stay PASS from
  the earlier increments. All other criterion statuses are unchanged; all
  preexisting PENDING criteria — including AC-006 (J review), AC-411 (UI
  fallback, issue #392) and AC-436 (true OCC concurrency) — remain PENDING.
  PL-BOOKING is NOT complete and stays unchecked; full delivery is NOT
  complete. The lifecycle meaning ambiguity stays unresolved.
- This receipt records pre-commit local validation. Git commit/push/tag, CI and
  the post-commit regeneration gate are separate evidence; no authenticated
  browser workflow, visual/J pass, real parallel-race proof or production
  qualification is claimed here. AC-412/AC-433 require runtime P evidence only.

## What changed and why it matters

- `src/sales/proposal.manifest` (+ regenerated `convex/mutations.ts`):
  `stageEventLink`/`linkEvent` now allow `draft or accepted`. A draft link
  emits a null `dishSelectionProposalId` cascade key, so unaccepted menu never
  copies — `ProposalAccepted` copies the menu exactly once, at acceptance.
- New internal `convex/lib/proposalEventCreation.ts`
  `linkConvertedQuoteProposal`: loads Proposal and Event through the generated
  authorized reads (`api.queries.getProposal`/`getEvent`), validates the Event
  BEFORE any success return (including the same-event no-op), refuses
  client mismatch and a differing existing `proposal.eventId` without
  overwriting, and links only through `Proposal_stageEventLink` →
  `Proposal_linkEvent` in-transaction; an uncaught throw rolls the staged
  pointer back. An already-valid same-event link is a no-op (replay never
  bumps the proposal version). No new public API, no Event creation here, and
  all generated runtime changes came from Manifest regeneration.
- `convex/quoteBuilder.ts` `processQuoteSubmission`: before considering a
  create, a missing Event checkpoint is recovered from the saved proposal's
  `eventId` pointer before creating another Event; before completion, the
  recovered Event is validated and the canonical link is reconciled. A link
  failure pushes a `proposal event link` error, so the submission row stays
  `failed` with both recorded ids preserved instead of completing unlinked.

## Test evidence

Four new real runtime cases in `tests/proofs/quote-conversion.runtime.test.ts`,
seeded with durable checkpoint state and driven through the real retry,
actions, commands and readback (not transport fault injection and not actual
parallel-race simulation): 'resumed conversion keeps one Proposal-to-Event
relationship' (AC-412/AC-433 describe); and in the AC-433
persisted-checkpoint describe 'recovers a conversion whose checkpoint lost the
event id by reusing the saved proposal's event', 'fails a conversion whose
saved proposal and checkpoint name different events, preserving both ids', and
'fails a conversion whose recovered event was soft-deleted, preserving
checkpoint and pointer'. The original six cases are unchanged.

Complementary existing suites: `proposal-event-booking.runtime.test.ts`
(12 cases — accepted-first, menu copy, replay) and
`quote-to-booked-event.runtime.test.ts` (1 case — the complete quote journey)
cover the other legs of both criteria; `accepted-revision-link` (6) and
`signature-acceptance-equivalence` (10) stay green.

## Gate runs (logs under `.artifacts/iteration-booking-next/`)

| Run | Result | Proof |
| --- | ------ | ----- |
| `red.log` | RED | 6 original cases green; the new canonical-link case failed (`proposals[0].eventId` undefined vs the retry-created event id) against the then-broken retry. |
| `207-validate-recovered-event.log` | RED → corrected | The soft-deleted-Event case first failed RED (`expected [] to have a length of 1` — conversion completed over the deleted Event); after the correction the retry fails cleanly with the checkpoint and pointer preserved. |
| `focused-final.log` | PASS | Focused run: 5 files / 39 tests — quote-conversion, quote-to-booked-event, proposal-event-booking, accepted-revision-link, signature-acceptance-equivalence. |
| `test.log` | PASS | Full `bun run test`: 197 files / 918 tests. |
| `check-final.log` | PASS exit 0 | Full `bun run check`: toolchain, ownership guard, proof emit/check, manifest registry and nine per-domain gates, design vocab, typecheck, format, secrets, coverage (197/918), build, `baseline-decay: ok`. |
| `check-shared-head.log` | PASS exit 0 | Fresh full `bun run check` at shared HEAD `0d203713`: 197 files / 918 tests, build and `baseline-decay: ok` (verified at log end), over the landed commit plus the remaining increment and preserved user files. Local dirty-working-tree evidence, NOT CI or clean-commit validation. `check-final.log` is kept as the original evidence. |
| `review.log` | APPROVE | Ends `VERDICT: APPROVE` (gpt-5.6-sol, read-only, scoped to this increment's diff). |

Maintenance limitation, recorded honestly: the first full check passed
ownership, domain, design and typecheck, then stopped on formatting of the preserved user-owned `loop-ledger.json`. Worker 209
normalized the whitespace with exact parsed-JSON equality proven
(`ledger-before-format.json`, `ledger-parsed-before.json`,
`ledger-parsed-after.json`, `209-normalize-preserved-ledger.log`); the ledger
remains user-owned and unstaged. Because an unrelated session also made its own
commits during the window, this receipt does NOT claim all startup files
byte-identical. No dependencies changed.

## Source identity

- Work started at `6c29cc29` (required upstream
  `89262916f59e32dbed5d63749999309a62586742` already ancestral;
  `git pull --no-rebase origin dev` up to date; no dependency changes). The
  concurrent unrelated commits `70498825` and `0036fc39` landed during the
  window; the full check ran AFTER `0036fc39` (check log 23:35–23:38; commit
  23:15 PDT).
- These are pre-commit working-tree gates with the increment plus preserved
  user changes, not clean-commit CI. No production or release action.
- A shared-checkout Git race changed the facts after task211: another session
  committed `0d203713` while the orchestrator had staged only its reviewed
  helper/import hunks, so that commit contains BOTH this increment's internal
  helper/import and the other session's separate client-match guard in the
  existing public `createEventFromAcceptedProposal`. Git history is
  preserved. The orchestrator byte-checked that removing only that external
  guard from the committed file reproduces the exact validated source
  SHA256. That guard is NOT part of this increment's independent approval
  scope. The remaining increment files will land in a follow-up commit; no
  full application commit/push/CI claim is made yet.
- `bun run manifest:regen` owns the runtime mutations, ownership hashes and
  five `.builder/baselines` blobs; `bun run check` proof:emit refreshed three
  `generated/proof` IR hashes. All generated edits are tool-produced.

## Preview identity (local serving only)

`http://127.0.0.1:7813` verified by the Vite process (PID 45384, command line
rooted in `C:/Projects/capsule`); the repeatable check
`powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813` passed source
identity and is already in `.ralph.env` (`RALPH_PREVIEW_CHECK_CMD`,
unchanged). The served `main.tsx` points at `VITE_CONVEX_URL`
`http://127.0.0.1:3210`; the port-3210 backend (PID 55244, parent 55200) runs
`--local-storage` at this checkout's `.convex/local/default` and
`authStatus:getAuthStatus` succeeded anonymously
(`local-function-spec.json` registers
`lib/proposalEventCreation.js:linkConvertedQuoteProposal`). No instance
secrets are printed here. No authenticated browser, visual/J, or actual OCC
concurrency proof ran; this increment adds no authored UI, so no new
subjective UI qualification is claimed.

## Criterion outcome

- AC-412 → PASS: both paths are proven — quote conversion creating a linked
  draft that later accepts and books (resumed-conversion case, plus the
  complete `quote-to-booked-event` journey), and accepted-proposal-first
  booking (`proposal-event-booking` suite, unchanged).
- AC-433 → PASS: quote conversion and accepted-proposal booking converge on
  one Event — the retry suite proves link-before-completion, checkpoint
  recovery, conflicting-id refusal and deleted-Event refusal, and the existing
  `quote-to-booked-event` and `proposal-event-booking` suites are retained in
  the verification cell.
- All other criterion statuses are unchanged. AC-006 (J), AC-411 (UI
  fallback, issue #392) and AC-436 (concurrency) stay PENDING; the public
  booking replay-role concern stays explicitly unconfirmed. Post-commit
  regeneration, Git commit/push/tag and CI are separate evidence to follow.
