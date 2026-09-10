# Authenticated staffing and My Day qualification

## Current state, 2026-09-10

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
