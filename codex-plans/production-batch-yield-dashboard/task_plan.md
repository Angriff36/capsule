# Task Plan: Production batch yield dashboard

## Goal

Aggregate completed production-batch yield by recipe and rolling period, then rank the largest under-yield so kitchen leads can target training.

## Current Phase

Phase 5

## Phases

### Phase 1: Explore and stabilize scope

- [x] Trace ProductionBatch and Recipe schema fields, generated read hooks, production routes, navigation, and comparable report pages.
- [x] Confirm no active concurrent writer is touching the feature paths.
- [x] Record the exact authored seam and files that must remain untouched.
- **Status:** complete

### Phase 2: Plan the implementation

- [x] Validate calculation, filtering, grouping, ranking, date-window, and empty-state semantics against live code.
- [x] Define the smallest route, navigation, UI, and documentation changes.
- **Status:** complete

### Phase 3: Implement

- [x] Add authored aggregation logic and dashboard UI.
- [x] Wire the authored route and navigation without editing generated files.
- [x] Preserve all unrelated dirty and untracked work.
- **Status:** complete

### Phase 4: Verify

- [x] Run focused formatting, typechecking, and relevant existing tests.
- [x] Create, run, and delete a temporary Playwright test covering the core feature.
- [x] Run the required `bun run check` gate (attempted; blocked by unrelated issue #60 after early gates passed).
- **Status:** complete with documented unrelated full-gate blocker

### Phase 5: Deliver

- [x] Inspect the exact feature diff and final repository state.
- [x] Leave the working plan unarchived because the required full gate is blocked outside this feature.
- [x] Produce the required tagged summary.
- **Status:** complete

## Constraints

- Do not hand-edit generated or Builder-owned files.
- Do not add or expand permanent tests; only the explicitly required temporary Playwright verification is allowed.
- Do not overwrite, move, stash, or reformat unrelated dirty work, especially `.aboardai/**`.
- Stop if timestamps or content show another session actively editing the same feature files.
- Use Bun-based repository commands and `bun run manifest:regen` as the only regeneration entry if regeneration is actually required.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Exact yield-dashboard files appeared during exploration, proving a concurrent writer on the same slice | 1 | Do not edit overlapping product files; wait for stable timestamps, then inspect and verify the incoming implementation before adopting it |
| Page and CSS changed again after the first stabilization window | 2 | Pause again; require three stable hash/timestamp snapshots over twelve seconds before verification |
| First temporary Playwright run could not resolve the harness entry because Vite started from the config directory | 1 | Set the temporary Playwright web server `cwd` to the repository root, then rerun the same behavioral assertions |
| Required `bun run check` stopped at seven unrelated Event integration-guard violations | 1 | Preserve Event files; use existing GitHub issue #60 for durable escalation and run production-specific/downstream gates independently |
| Existing `bun run test` reported 14 failures outside this feature | 1 | Confirmed all failure classes are already tracked by open issues #32 and #60-#65; preserved those files and relied on passing scoped/browser/build evidence for this feature |
