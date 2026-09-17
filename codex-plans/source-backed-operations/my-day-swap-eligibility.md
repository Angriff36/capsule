# My Day swap eligibility

## Current state, 2026-09-10

The upstream generator fix is implemented in isolated Manifest worktree
`C:/Projects/Manifest/.worktrees/convex-index-storage-validators`, source commit
`47d176213d9dbcfd84385790e31d1832b0565fb7`, documentation commit
`1bb0c7a5c5cad8cf89d51afccc0a717c1232a3ae`. Independent gpt-5.6-sol APPROVE and
all local checks passed (4,519 tests / 60 skipped), followed by Linux and Windows
CI run 34532193788. PR https://github.com/Angriff36/Manifest/pull/82 merged as
`0dc6803e8aeb9fd6a4789d268ded8b4494f5bd13`. Registry release run 34532756346
succeeded and published 3.6.54. Capsule and its isolated Builder both resolve
3.6.54; Capsule pins it exactly and normal `bun run manifest:regen` succeeded.
The integrated Capsule diff has independent gpt-5.6-sol APPROVE. Full
`bun run check` completed with exit 0: 165 test files / 1,468 tests passed,
along with typecheck, formatting, secrets, ownership, proofs, integration,
design vocabulary, coverage, local build and baseline decay.

Additional browser qualification reproduced and fixed selection loss during
periodic candidate reload. The card now controls its selected Person ID while
using the current eligible result and proof references on submission. Mobile
measurement also found 32px inputs; the existing My Day phone media block now
gives non-textarea input/field controls a 44px minimum, including sibling
availability forms. Both follow-ups have independent gpt-5.6-sol APPROVEs and
1440/900/390 browser proof; the existing clock/shift/schedule browser regression
also passes. The runtime proof additionally covers absent/null/exact-end/expired
certifications and malformed missing-start history preceding a real conflict.

The prior staffing replacement checkpoint is committed and pushed as
`b7aa18a54a7938775ba6e21cc5d9eb1c0ef630e6`, with gpt-5.6-sol APPROVE and the full
repository check passing 165 files / 1,468 tests. This new My Day change is ready
for its own branch checkpoint. The original operations goal remains active;
no Capsule production write or deployment has occurred.

## Reproduced defect and change

Ordinary linked event staff can read their own scheduled shift and coworkers,
but cannot read workforce-only Qualification, TrainingCompletion or ShiftType
lists. The previous browser eligibility helper therefore hid a fully qualified
coworker. The same proposed swap succeeds through generated propose, accept and
approve commands with the actual credential references. This is issue #359.

`convex/staffShiftSwaps.ts` now supplies a minimal candidate projection. It reuses
generated Shift authorization and the workforce capability switch, then reads
the relevant private evidence server-side. Only the coworker's name, Person ID
and required proof IDs leave the query. Approved leave and overlapping scheduled
or started shifts exclude a coworker; pending leave does not. A second projection
supplies the role and full time window for the recipient's pending incoming
non-event shift without exposing its full private record.

`src/lib/staffShiftSwaps.ts` contains the thin read hooks. `ShiftSwapCard` uses
these projections and retains the existing generated write contract. Loading is
distinct from an empty eligible list. Incoming requests display both start/end
and role. The existing DESIGN.md presentation language is retained.

The first independent review rejected whole-tenant historical scans and cached
wall-clock eligibility. Indexed lookups now select active people, matching
certification/training and current overlapping windows; incoming reads use the
generated recipient-and-status query. Explicit `now` refreshes at the next shift
start, every 30 seconds and on foreground resume. The card uses the same time.
gpt-5.6-sol re-reviewed these changes and APPROVED the bounded diff after the
mandatory anti-tedium and DESIGN.md review. This does not waive failing gates or
prove the full application, live repair or release.

## Verification and resolved generator failure

The scratch qualification `qualify-my-day-swap-eligibility-gap.ts` uses the
actual generated runtime with isolated linked staff and private source records.
It verifies qualified inclusion, privacy, pending/approved leave, private shift
conflicts, capability-off behavior, unrelated-user isolation, the start-time
boundary, incoming minimal details and generated propose/accept/approve. It
passes and produces `my-day-swap-eligibility-qualified.json` plus browser states.

`qualify-my-day-swap-browser.mjs` renders the actual MyDayPage and generated hooks
with those runtime snapshots. It passes at 1440, 900 and 390 pixels: loading,
eligible selection and exact proof arguments, failed-command input retention,
keyboard retry, incoming start/end/role, acceptance, unavailable state, shift-start
refresh and no horizontal overflow. The desktop picker and phone incoming
screenshots were inspected. This is isolated transport qualification, not an
authenticated full-app or deployed-data check. Artifacts are under
`.artifacts/operations-source-study/`.

Initial typechecking failed in three newly generated indexed list queries:
timestamp arguments used `v.string()` while their schema fields used numbers.
Issue: https://github.com/Angriff36/capsule/issues/364. Manifest 3.6.54 now reuses
the declared property's storage validator, including optional/nullable values,
instead of guessing its query argument type. The isolated upstream fix was
reviewed, published and consumed as described above; the primary dirty Manifest
checkout was preserved. No generated output was hand-edited.

The final runtime qualification also executes generated Qualification queries
with missing/null/numeric expiry, generated Shift and TimeOffRequest date-index
queries, and rejects a string Shift timestamp. The full check log is
`check-my-day-swap-eligibility.log`; final runtime and browser logs are
`my-day-swap-eligibility-qualified-3.6.54.log` and
`my-day-swap-browser-qualified.log`. The existing My Day clock, shift and schedule
regression also passes at all three widths.

Vite ignored changes to the scratch JSON fixture under `.artifacts`, leaving an
older initial snapshot in its module cache. Browser qualification now injects
the latest runtime data before each page starts and asserts its initial shift
timestamp matches that artifact. The final runtime run preceded the final
browser run. This fixture correction does not change application behavior.

Authenticated full-app verification, source-backed culinary/purchasing/packing/
report work, affected live-data repairs and authenticated release proof remain
part of the original goal.
