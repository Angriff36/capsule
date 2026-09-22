# PL-BOOKING public-signature equivalence increment evidence — 2026-09-21

Receipt for the public-signature acceptance-parity increment on shared `dev`
(issue #390). Documentation only here. The public anonymous signature path now
reaches the SAME canonical acceptance the operator path uses, so a digitally
signed event gets the same ledger row, stored accepted revision and menu copy.
Worker `glm-5.3-flash` authored code/tests; orchestrator `gpt-6-astra` read all
diffs and independently ran the proving commands. Review APPROVE covers this
increment only, not all `dev` history.

## Scope and status

- AC-414 and AC-435 → PASS. Existing PASS criteria remain PASS. All other
  criterion statuses are unchanged; all preexisting PENDING criteria — including
  AC-006, AC-100, AC-398, AC-410, AC-411, AC-412, AC-415, AC-433, AC-436,
  AC-437 — remain PENDING. PL-BOOKING is NOT complete and stays unchecked.
- This receipt records pre-commit local validation. Git commit/push and the
  post-commit regeneration gate are separate evidence; no Linux CI,
  authenticated browser workflow, visual pass, or production qualification is
  claimed here. AC-414/AC-435 require runtime P evidence only; no browser or J
  proof is claimed.

## What changed and why it matters

Before this increment the public seam (`convex/signatureAcceptance.ts`)
patched the Proposal and inserted the ProposalAccepted ledger row directly,
skipping the generated `Proposal_accept` fanOut — a digitally signed event
started with an empty kitchen board while the operator path showed the full
menu (#390), and the tenant's sales capability switch was ignored on that path.

The repair re-implements nothing: after the seam's existing token, revision and
proposal validations, the acceptance runs the existing canonical
`mutations.Proposal_accept` in the current transaction through
`TenantSystemCommandRunner.forTenant` pinned to the ALREADY VALIDATED
`request.tenantId` — never caller input. The token/revision checks and the
idempotent replay behavior are unchanged; the menu cascade
(ProposalDishSelection → EventDish.confirmFromProposal) and the generated
policies/guards (sales role policy, capability kill-switch, status/expiry
guards) now apply to public acceptance too. A downstream rejection rolls the
signature completion back with the acceptance. No new policy, no copied cascade,
no new public privileged API, no hand edit of generated runtime code. The proof
is `tests/proofs/signature-acceptance-equivalence.runtime.test.ts` (10 tests):
operator, generated-signature and public-anonymous equivalence; kitchen-edited
EventDish wins; atomic foreign-Event refusal with nothing written plus a
repaired-link retry of the SAME token succeeding; disabled-sales rollback;
public-first and operator-first replay; and the token guards (invalid, expired,
revoked, external provider, mismatched proposal, foreign revision).

## Gate runs (logs under `.artifacts/iteration-booking/`)

| Run | Result | Proof |
| --- | ------ | ----- |
| `acceptance-red-final.log` | RED | First run of the new suite: 5 failed / 5 passed (10 tests) against the then-broken public path. |
| `focused-green.log` | PASS | Focused run: 4 files / 29 tests — the new 10-test suite plus the accepted-revision-link, proposal-event-booking and quote-to-booked-event proofs. All 10 new tests were green before review. |
| `full-test.log` | PASS | Full `bun run test`: 197 files / 914 tests. This run preceded the test-only review correction; the final check below includes that correction. The suite grew from 196 files/904 tests to 197 files/914 tests with this 10-test proof. |
| `check-final.log` | PASS exit 0 | Full `bun run check`: toolchain, ownership guard, proof emit/check, manifest registry and nine per-domain gates, design vocab, typecheck, format, secrets, coverage (197/914), build, baseline-decay (`baseline-decay: ok`). |
| `public-signature-source-hashes.json` | recorded | SHA-256 of the seam, manifest, test, both complete-feature spec files, ownership ledger and four hash-bearing generated outputs; the three authored files still match the working tree today. |

Review: `independent-review.log` ends `VERDICT: APPROVE` (gpt-5.6-sol,
read-only; the reviewer did not run tests). The reviewer first REJECTED only one
thing — the foreign-Event rollback proof was coupled to a brittle generated
guard-number assertion ("Guard 2 failed"). That single assertion was replaced by
an ordinal-free refusal plus all unchanged-state assertions (proposal, request,
ledger, event dishes and the foreign Event byte-identical before/after) and a
stronger valid counterpart: repairing ONLY the corrupted eventId lets the SAME
request token succeed with exactly one canonical acceptance. All original
behavioral assertions remain.

## Source identity

- Source began at `330dd06f` (required upstream
  `89262916f59e32dbed5d63749999309a62586742` already ancestral;
  `git pull --no-rebase origin dev` up to date; no dependency changes). During
  the work the concurrent unrelated catalog commit `46b5483d` landed and is
  included in the final full validation above.
- These are pre-commit working-tree gates, not clean-commit CI.
- `bun run manifest:regen` produced only comment metadata: the ownership
  ledger, four hash-bearing generated files and four content-addressed
  `.builder/baselines` blobs. `bun run check` proof:emit refreshed the IR hash
  of three `generated/proof` files. No generated runtime behavior changed.
- Startup user-owned files stayed byte-identical by SHA-256; unrelated
  concurrent work is preserved. No git commit/push, Linux CI, or deployment
  claim is made in this receipt; those follow separately.

## Preview identity (local serving only)

`http://127.0.0.1:7813` verified by the Vite process (PID 45384, command line
rooted in `C:/Projects/capsule`) plus a served source map naming this checkout
(`public-signature-preview.log`); the repeatable check
`powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813` is already in
`.ralph.env` (`RALPH_PREVIEW_CHECK_CMD`). The port-3210 local backend (PID
55244) runs `--local-storage` pointing at this checkout's `.convex/local`
directory and `authStatus:getAuthStatus` succeeded anonymously
(`public-signature-backend.log`; process listing
`public-signature-processes.log`, already redacted). Browser automation was
unavailable (CUA reported no browser), so no visual, authenticated-workflow or
J proof ran; this increment adds no authored UI.

## Criterion outcome

- AC-414 → PASS: signature completion (generated `SignatureRequest_complete`
  and anonymous public `completeSignature`) emits the same canonical acceptance
  effects as operator `Proposal_accept` — one ProposalAccepted ledger row with
  the exact accepted revision and event, and one identical menu copy — with no
  duplicated ledger event.
- AC-435 → PASS: the replay/mixed-ordering cases in the SAME
  `tests/proofs/signature-acceptance-equivalence.runtime.test.ts` (not a
  separate acceptance-replay file) prove a re-click, an operator retry after a
  public acceptance, and a public completion after operator acceptance each add
  no second menu set or acceptance effect.
- All other criterion statuses are unchanged: existing PASS remains PASS and
  preexisting PENDING remains PENDING. No criterion was renumbered, deleted,
  retired, or weakened. The lifecycle meaning ambiguity stays unresolved, and
  browser/J qualification stays open (AC-006 pending). Full PL-BOOKING delivery
  remains incomplete.
