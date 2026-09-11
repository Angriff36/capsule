# Authenticated staffing and My Day qualification

## Authenticated app qualification, 2026-09-10

Checkpoint `e62fcffb2d98e6df0346a269cb60bbd75e675901` is saved and verified on
origin. Its complete function set registered on the isolated native backend at
3216/3217; source-map-proven Vite 7814 serves that worktree. Real browser sockets
connect to backend 3216. Four development Clerk identities represent a manager,
two event-staff coworkers and a workforce-staff member. Organization/admin
bootstrap uses the authored encryption format and mixin fields; other fixture
records were created through generated commands. These are synthetic identities
and dates using the training timing pattern, not repaired production records.

The real authenticated app now proves:

- Manager assignment and vacancy fill create connected Shifts with the event's
  calculated crew window. The example has eight generated timing milestones.
- Crew volunteer and release their hold. My Day shows personal assignments;
  shared event roster shifts remain readable and unrelated personal shifts stay
  private.
- A credentialed swap offers the eligible coworker without returning private
  qualification/training rows. Proposal saves the correct recipient references;
  recipient acceptance and manager approval transfer the unchanged shift window
  and update both My Day lists.
- Both event-staff and workforce-staff identities start their own Shift, clock
  in/out and finish, with exactly one linked TimeRecord per sequence.
- Current event work automatically receives Event and Shift attribution at
  clock-in. Replacing its coverage preserves the completed Shift and TimeRecord
  byte-for-byte, preserves another assigned role, and carries service instructions
  into the remaining coverage window. The manager sees the original/replacement
  history. Reopening creates one vacancy, retires its future replacement Shift
  and removes that Shift from the recipient's My Day.

Staffing and My Day were captured at 1440/900/390 pixels. Swap proposal/acceptance,
clock actions and replacement prompts/history were inspected on phone. Successful
flows had no page exceptions or HTTP error responses. Navigation-aborted image
requests are recorded separately. Evidence under
`.artifacts/operations-source-study/authenticated/`: `fixture-state.json`,
`bootstrap-receipt.json`, `seed-session-token.log`, and
`{staffing,swaps,clock,replacement}-receipt.json` with matching logs/screenshots.
`replacement-fixture.json` stores the before snapshots for completed work.

The ignored real-backend browser driver is `qualify-authenticated-staffing.mjs`.
Its completed swap/replacement scenarios are stateful evidence; prepare separate
fixtures before replaying them as fresh scenarios. No new authored Capsule tests
were added. An initial scratch helper requested a nonexistent named JWT template;
matching the installed Convex provider's session-JWT integration corrected it
without any product auth change, Clerk setting change or invitation email.

The published Manifest 3.6.55 correction and native full-app acceptance close
issue #365. The e62fcffb full check passed 165 files / 1,468 tests and all other
gates, with independent gpt-5.6-sol APPROVE and verified branch push. See
`query-name-limit-checkpoint-receipt.json` and the issue's resolution comment.

Phone inspection found clipped Event actions (#366). The local correction wraps
the group, aligns its menu to the right and stacks actions below 520px as
DESIGN.md requires. Real header/control/open-menu geometry passes at
360/390/519/520/640/767/768/900/1440px. Existing tokens, shapes and commands stay.
The first retry exposed stale preview modules (#367): Vite's global worktree
ignore also excludes the active checkout. Anchoring it to this checkout's child
worktrees restores source updates. A controlled edit and exact restoration both
reach served modules without restart. Evidence: `event-actions-{baseline,fixed}.json`
and `worktree-watch-receipt.json`. The verification worktree currently contains
the same three authored phone/preview edits as the task branch over e62fcffb.
Their full checks and independent review are being completed before checkpoint.

Issues #358/#359 remain open for affected live-data repair and release/deployed
proof. The broader culinary, purchasing, packing, reports/print and full original
goal remain required. No Capsule production write or deployment has occurred.
The historical bring-up notes below are superseded by this verified state.

## Initial native backend bring-up, 2026-09-10 (historical)

The My Day checkpoint `11451fe86ac0da8d02ad7723e1894fe85f60b86a` is committed and
verified on origin/fix/source-backed-catering-workflow. Its full repository gate
and isolated runtime/browser checks pass, with independent gpt-5.6-sol APPROVE.
Those checks did not prove that the real Convex backend accepts every generated
function identifier. This qualification found an additional generator blocker.

An isolated detached worktree at
`C:/Projects/capsule/.loop-worktrees/operations-authenticated` contains that exact
commit with frozen dependencies. It owns an anonymous local Convex backend on
3216/3217. The development Clerk issuer and an independent encryption key are
configured there; the primary/shared backend and Capsule production are untouched.

The actual backend rejects the initial function push:

```text
InvalidFunctionName: Invalid function name used in queries.js:
Identifier is too long (66 > maximum 64)
```

The offending export is
`listQualificationByTenantIdAndPersonIdAndStatusAndNameAndExpiresAt`. Issue:
https://github.com/Angriff36/capsule/issues/365. No generated output was hand-edited.

## Source correction and evidence

The fix lives in isolated Manifest worktree
`C:/Projects/Manifest/.worktrees/convex-index-query-names`, based on registry3.6.54
main `d5fd84b26432088fb004e47e0836b49f3b6f0278`. Source commit
`a65cd42847f55c1ca7a4e953541746075db8ff77` preserves indexed-query names through64
characters; longer names retain a readable prefix and deterministic FNV-1a/64
suffix. Four compile/generate/execute regressions demonstrated red/green. The
full suite passed4,523 tests /60 skipped; required builds, typecheck, lint,
formatting, docs and cycles passed. Final independent gpt-5.6-sol APPROVE includes
the proof matrix/TODO/inventory commit `673d53d4010862850d1915c27c8abb4ab11769c5`.

PR https://github.com/Angriff36/Manifest/pull/83 passed exact-head Linux/Windows
and security checks in run34535697506, then merged as
`5d9e9b6029d596e71ed326e3cf3663f6ec0839e6`. Release34536182596 succeeded and
published3.6.55 (registry gitHead `ce7febbe1125f81124a742f997c9597fb94b7614`).
Capsule and its isolated Builder now resolve3.6.55; normal regeneration passed.
The integrated consumer diff has independent gpt-5.6-sol APPROVE. The only query
behavioral line change is the export name; index, args, read policy, filtering
and decryption remain unchanged. Full Capsule check36750 completed exit0:
165 test files /1,468 tests passed, along with typecheck, format, secrets,
ownership/proof/integration/design checks, coverage, local build and baseline
decay. Log: `check-query-name-limit-3.6.55.log`. The complete app backend retry
and authenticated browser qualification remain required.

A second isolated native backend on3218 accepted a minimal schema/query fixture
generated directly from the fixed Manifest source. At2026-09-10T22:02:36Z,
`listQualificationByTenantIdAndPersonIdAndStatus_fc55c83d9b5988de` (64 characters)
returned its matching credential row, returned no rows for a different timestamp
and rejected a string timestamp. This proves native registration and indexed
execution for the source correction, not the authenticated Capsule application.

Artifacts under `.artifacts/operations-source-study/`:

- `manifest-query-names-{red,green,tests,typecheck-final,docs-final,ci}.log`
- `generate-query-name-native.mjs`, `verify-query-name-native.mjs`
- `query-name-native/native-proof.json`
- `prepare-authenticated-worktree.mjs`, `configure-authenticated-backend.mjs`
- `prepare-authenticated-actors.mjs`, `prepare-authenticated-bootstrap.mjs`
- `authenticated/actors.json`, `organizations.json`, `bootstrap-people.json`

Four distinct development Clerk identities exist for the isolated qualification:
a manager, two event-staff coworkers and one workforce-staff member. Their
identity records are fixture-only and reusable by an exact external marker.
One Organization and one encrypted admin Person bootstrap row are prepared but
not imported. Subsequent staff and operational records must be created through
the real generated commands. Sign-in uses the product's Clerk ticket path; no
Clerk setting changes or invitation emails are involved.

## Remaining verification

Save and verify the branch checkpoint. Move the isolated app
worktree to that commit and prove its full function set is
accepted on3216 before importing the empty-backend bootstrap. Serve that worktree
on a separate frontend port and verify its source map, process and backend URL.

Then exercise the training worked example through the authenticated manager and
crew routes: event timing into assignment/Shift windows, roster and open staffing,
own shift/time-clock actions, swaps and their credential/privacy behavior, and
replacement/history preservation. Check desktop and phone UI, real persisted
records and page/network failures. Preserve the distinction between these local
checks, affected live-data repair and authenticated deployed proof. All broader
culinary/purchasing/packing/report requirements remain in the original active goal.
