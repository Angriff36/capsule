# PL-BOOKING accepted-revision identity increment evidence — 2026-09-21

Receipt for the accepted-revision identity increment on shared `dev`. Documentation
only here. The increment stores one stable `acceptedRevisionId` at acceptance and
makes the event booking read resolve that stored reference. Workers `glm-5.3-flash`
authored code/tests; orchestrator `gpt-6-astra` inspected all diffs and ran the
proving commands. Review APPROVE covers this increment only, not all `dev` history.

## Scope and status

- AC-413 and AC-434 → PASS. Existing PASS criteria remain PASS. All other
  criterion statuses are unchanged; all preexisting PENDING criteria, including
  AC-006, AC-100, AC-398, AC-410, AC-411, AC-412, AC-414, AC-415, AC-433, AC-435,
  AC-436, AC-437, remain PENDING. PL-BOOKING is NOT complete.
- This receipt records pre-commit local validation. Git commit/push and the
  post-commit regeneration gate are separate evidence; no Linux CI, authenticated
  browser, or production qualification is claimed here.

## Source identity

- Verification began at HEAD `3bec5659` (work started at `a8d8a35f`). This is
  pre-commit working-tree evidence, not a clean-commit run. During validation,
  concurrent catalog commit `2e5cdfd8` from another session arrived (21:14:58);
  the seven authored/test files' SHA-256 entries in
  `.artifacts/iteration-booking/final-source-hashes.json` were re-checked after
  it and remained identical.
- Required upstream `89262916f59e32dbed5d63749999309a62586742` is ancestral;
  `git pull --no-rebase origin dev` was up to date. No branches, no worktrees, no
  deploy, dependencies unchanged.
- Key source SHA-256 values are recorded in
  `.artifacts/iteration-booking/final-source-hashes.json`
  (`convex/signatureAcceptance.ts`, `convex/quoteBuilder.ts`,
  `convex/lib/proposalAcceptanceRevision.ts`, `convex/lib/operationalEvents.ts`,
  both sales manifests, and the new proof test).

## Why the stored reference is the evidence

The exact accepted revision must stay durable independent of later captures or
signatures, so the accepted commercial snapshot is never inferred from the
proposal's latest mutable draft:

- The operator accept path records the highest-numbered live, already-captured
  revision as of acceptance time; it creates no revision. It writes an explicit
  null when none exists (the no-revision operator path stays allowed).
- The generated signature reaction and the public token signature path
  (`convex/signatureAcceptance.ts`) both bind the signed revision.
- A foreign, proposal-mismatched, or uncaptured revision is refused atomically.
  Public validation previously accepted an uncaptured, still-mutable
  ProposalRevision, so a later capture could have relabeled the accepted evidence;
  `capturedAt == null` was added to the existing revision-unavailable checks in
  `getPendingSignatureRequest`/`completeSignature` (same generic null/error,
  transaction rollback intact).
- The event booking read (`getEventBookingDetails` in `convex/quoteBuilder.ts`)
  resolves the stored reference. A missing historical revision stays an explicit
  unresolved state; historical signed rows without the field use the original
  signature completion no later than `acceptedAt`. No migration or backfill.
- Identical replay already returned the saved Event (commit `305c7473`, proven in
  `tests/proofs/proposal-event-booking.runtime.test.ts`) — unchanged, not rebuilt.

Open follow-up, unconfirmed and not a proven exploit: the replay early-return
resolves the linked Event before any generated sales-access/event policy runs.
Inspect the generated policy; record a scoped follow-up only if real. The public
menu-cascade gap stays open as issue
[#390](https://github.com/Angriff36/capsule/issues/390).

## Gate runs (logs under `.artifacts/iteration-booking/`)

| Run | Result | Proof |
| --- | ------ | ----- |
| `revision-red-corrected.log` | RED | Initial five tests failed against the old source. |
| `uncaptured-red.log` | RED | Uncaptured-refusal test failed before its fix. Worker-transcribed output: the worker's shell redirection was blocked, so this file is not orchestrator-native capture — provenance differs from the other logs. |
| `revision-final.log` | PASS | Focused run: 4 files / 25 tests, including the 6 new tests in `tests/proofs/accepted-revision-link.runtime.test.ts`. |
| `test-final.log` | PASS | Full `bun run test`: 196 files / 904 tests. Counts include concurrent committed catalog work; the delta is not all from these 6 tests. |
| `check-final.log` | PASS exit 0 | Full `bun run check`: typecheck, format, secrets, proof/Manifest guards, coverage (196/904), build, baseline-decay. |
| `regen-determinism-result.txt` | PASS | `bun run manifest:regen` succeeded; a deterministic second rerun matched SHA-256 for all 19 owned paths + ledger (20 files, unchanged). |

Pre-commit `manifest:regen:check` exited 1 because it checks Git status of owned
outputs and the increment's owned changes were uncommitted — not because it
detected additional byte drift. It is a pre-push gate that runs against committed
output, so its green result is separate post-commit evidence not recorded here.

Review APPROVE: gpt-5.6-sol read-only source review (`review.log`) and
final-correction review (`review-final.log`). The reviewer did not run tests.

Formatting-only fixes to user-owned `loop-ledger.json` and the concurrent
catalog script `scripts/catalog-reclassification-plan.ts` preserved semantic
content (JSON compare / CRLF-normalized text compare). Another session later
committed its catalog script in `2e5cdfd8`; the telemetry file
`loop-ledger.json` remains unstaged.

## Preview identity (local serving only)

`http://127.0.0.1:7813` verified with the read-only
`powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813` (already in
`.ralph.env`). Vite PID 45384 has its command line rooted in `C:/Projects/capsule`
and the source-map check identifies this checkout; Convex PID 55244 runs
`--local-storage` pointing into `C:/Projects/capsule/.convex/local/default`.
`authStatus:getAuthStatus` succeeded anonymously. The local function spec shows
`mutations.js:Proposal_accept` now accepts the optional `acceptedRevisionId`
(`local-function-spec.json`). No process secrets or full backend command lines
were copied. The browser connector was unavailable, so no authenticated browser
pass ran. This is a backend-only increment with no new authored UI, so no new
subjective J gate applies (AC-006 stays pending).

## Criterion outcome

- AC-413 → PASS: the booking relationship resolves the stored accepted-revision
  reference for both signature and operator acceptance; the suite also proves the
  atomic refusals and the honest explicit-null path.
- AC-434 → PASS: the accepted revision is durably traceable from the Event and a
  later revision cannot relabel stored acceptance evidence.
- All other criterion statuses are unchanged: existing PASS remains PASS and
  preexisting PENDING remains PENDING. No criterion was renumbered, deleted,
  retired, or weakened. Not claimed as done: booking/commercial projection
  equivalence, race qualification, browser or production qualification.
