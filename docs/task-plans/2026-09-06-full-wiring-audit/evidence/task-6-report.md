# Task 6 implementation report

## Implemented

- Attachment removal now awaits the generated remove command, disables repeat removal while pending, clears prior errors on retry, and sends rejection text to the existing visible alert.
- Personal saved-view projection now waits for auth and filters SavedReportDefinition rows to the current `personId`, preserving the broader generated report query policy.
- Added authored `convex/lib/savedViewOperations.ts` mutations for atomic default changes and default-on-create. They load current owner/page rows server-side and invoke generated SavedReportDefinition commands. Nested failure rolls back the parent transaction.
- Added authored `convex/lib/clientOutreach.ts` ensure-open mutation. It runs the generated governed outreach query before any reuse, finds only a live open task, invokes the generated create command otherwise, and returns `created` plus `taskId`.
- Client retention uses the shared `runBulkItems`/`BulkRunFailure`, counts actual creations, reports opened/remaining counts on partial failure, retains uncovered-candidate filtering, and allows a later task after completion/dismissal.
- Revenue apply estimate initializes once per attribution apply context. Reactive event refreshes no longer overwrite operator amount or provenance.
- Regenerated `convex/_generated/api.d.ts` through documented codegen.

## TDD evidence

RED command:

`bunx vitest run tests/task-6-mounted-interactions.test.tsx tests/proofs/personal-views-and-outreach.runtime.test.ts`

Expected failures before implementation:

- `Could not find module for: "clientOutreach"` proved the ensure-open seam was absent.
- The first pass also exposed the test harness encryption-key prerequisite; after applying the existing proof setup, runtime behavior remained red until the module existed.
- The mounted file initially used a `.tsx` extension excluded by this repo's `tests/**/*.test.ts` configuration. It was moved to `.test.ts`; before the production fixes, attachment removal had no pending/error lifecycle and revenue apply initialization reran on reactive event identity changes.

GREEN command:

`bunx vitest run tests/task-6-mounted-interactions.test.ts tests/proofs/personal-views-and-outreach.runtime.test.ts tests/bulk-run-failure.test.ts`

Result: 3 files passed, 7 tests passed. The only output is the repository's existing Vitest `environmentMatchGlobs` deprecation notice.

## Additional verification

- `CONVEX_DEPLOYMENT=befitting-armadillo-283 bunx convex codegen --typecheck disable` — passed; bindings regenerated.
- `bun run typecheck` — passed.
- Named-file `bunx prettier --check ...` — passed.
- `git diff --check` — passed.
- `bun run secrets` — passed; fixture detection OK and tracked files clean.

## Tested boundaries

- Attachment pending duplicate click, rejection visibility/re-enable, and successful retry.
- Mounted revenue form operator edit plus reactive event-query refresh, including retained `Operator entered` provenance.
- Manager with two distinct owners: changing one owner's default does not alter the other owner's default.
- Default-on-create second-command failure rolls back the earlier default clear.
- Outreach ambiguous retry reuses the same open task; dismissal permits a later new task.
- Shared bulk failure cause/category and completed/unfinished item behavior remains green.

## Files changed

- `convex/lib/clientOutreach.ts`
- `convex/lib/savedViewOperations.ts`
- `convex/_generated/api.d.ts`
- `src/lib/useEnsureOpenClientOutreach.ts`
- `src/lib/useSavedViewOperations.ts`
- `src/features/attachments/AttachmentsSection.tsx`
- `src/features/clients/ClientRetentionPage.tsx`
- `src/features/finance/RevenueAttributionDetailPage.tsx`
- `src/features/views/useSavedViews.ts`
- `tests/task-6-mounted-interactions.test.ts`
- `tests/proofs/personal-views-and-outreach.runtime.test.ts`

## Self-review

- Confirmed new backend functions are under `convex/lib`, frontend access is through `src/lib/api.ts` and thin hooks, and generated writes remain authoritative.
- Confirmed no predictable child idempotency keys were added inside parent transactions.
- Confirmed outreach reuse performs generated authorization before returning and only an `open` status suppresses creation.
- No unrelated files changed. No production write, deploy, external repo change, or full suite was run.

## Concerns

- None. The Vitest deprecation warning is existing test-runner configuration noise, not introduced by Task 6.

## Review round 1 fixes

- Replaced the outreach raw-database reuse lookup with filtering over the generated governed query result. A caller without `salesAccess` now receives no visible reusable row and falls through to the generated create command, which rejects without returning or exposing the existing task ID.
- Replaced the single attachment removal ID with a per-row pending ID set. Duplicate activation of the same pending row remains blocked, while a second attachment can be removed concurrently and each row settles independently.
- Corrected the stale saved-view comment to describe the current-person projection over the intentionally broader report query.

RED command:

`bunx vitest run tests/task-6-mounted-interactions.test.ts tests/proofs/personal-views-and-outreach.runtime.test.ts`

RED result: 2 expected failures — the second attachment removal was called 1 rather than 2 times, and the denied outreach caller returned reuse success instead of throwing.

GREEN command:

`bunx vitest run tests/task-6-mounted-interactions.test.ts tests/proofs/personal-views-and-outreach.runtime.test.ts tests/bulk-run-failure.test.ts`

GREEN result: 3 files passed, 9 tests passed. `bun run typecheck` also passed.
