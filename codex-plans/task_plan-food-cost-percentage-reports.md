# Task Plan: Food cost percentage reports

## Goal

Calculate food cost as a percentage of revenue per event and by reporting period, show the trend over time, compare results with the operator target, and clearly flag periods above target.

## Current Phase

Phase 5

## Phases

### Phase 1: Requirements and discovery

- [x] Trace current finance reporting routes, revenue calculations, event cost data, and operator settings.
- [x] Identify current dirty-worktree files that must be preserved.
- [x] Confirm the smallest authored implementation seam.
- **Status:** complete

### Phase 2: Plan the implementation

- [x] Define calculation semantics and zero-revenue behavior.
- [x] Define aggregate period and trend presentation.
- [x] Define target source and threshold presentation.
- **Status:** complete

### Phase 3: Implement

- [x] Add scoped authored calculation and UI changes.
- [x] Preserve generated files and unrelated user work.
- **Status:** complete — adopted the stable concurrent implementation after review; no overlapping rewrite

### Phase 4: Verify

- [x] Run focused static and existing-test verification.
- [x] Create, run, and delete a temporary Playwright verification test.
- [x] Run `bun run check` (attempted; blocked by unrelated Event integration violations after early gates passed).
- **Status:** complete with documented unrelated full-gate blocker

### Phase 5: Delivery

- [ ] Review the exact feature diff and repository state.
- [x] Review the exact feature diff and repository state.
- [x] Keep the plan unarchived because the required full gate is blocked outside this feature.
- [x] Produce the required tagged summary.
- **Status:** complete

## Constraints

- Do not edit generated or Builder-owned paths.
- Do not add or expand permanent tests; only the user-required temporary Playwright test is allowed.
- Do not overwrite, move, or stash unrelated dirty work, especially `.aboardai/**`.
- Use Bun-based repository commands.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| A broad `rg` command included a PowerShell-incompatible `src/*.manifest` path and exited 1 after returning useful matches | 1 | Use concrete directories or paths discovered with `rg --files` |
| Exact food-cost feature files appeared after the initial status snapshot, proving concurrent work in the same slice | 1 | Stop feature edits, inspect the incoming implementation, and wait for the writer to stabilize before verification or any narrowly justified correction |
| A second repository search repeated the invalid `src/*.manifest` wildcard | 1 | Stop using wildcard path arguments on PowerShell; search explicit source directories only |
| First Playwright run used an ambiguous `Q3 ’26` text locator because both chart and table render the label | 1 | Narrow the assertion to the exact table cell; product behavior was already correct |
| Second Playwright run cleared the persisted target again on reload because `addInitScript` runs on every navigation | 2 | Clear storage once with `page.evaluate`, confirm storage reaches `34`, then reload |
| First patch for the second Playwright fix omitted a file header before planning-file hunks | 1 | Reissued a correctly segmented patch; no files were changed by the failed patch |
| Policy rejected a PowerShell command that would remove only the now-empty temporary directories | 1 | Leave empty untracked directories in place; all temporary test and harness files were already deleted with `apply_patch` |
| `bun run check` stopped at `check:event-manifest` on seven unrelated pre-existing Event violations | 1 | Preserve those files; record the exact boundary and run scoped feature formatting, tests, secrets, and build independently |
| Final symbol-search regex was malformed by PowerShell quote parsing | 1 | Use a single-quoted simple alternation without embedded quoted literals |
