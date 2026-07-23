# Task Plan: Food cost percentage reports

## Goal

Calculate food cost as a percentage of revenue per event and across selectable reporting periods, show the trend over time, compare results with the operator's target, and flag above-target periods.

## Current Phase

Phase 5

## Phases

### Phase 1: Requirements and discovery

- [x] Trace current event cost, invoice revenue, finance routing, and reporting UI patterns
- [x] Identify the narrow authored implementation seam and preserve all unrelated dirty work
- **Status:** complete

### Phase 2: Plan the implementation

- [x] Define source records, period aggregation semantics, target behavior, and empty states
- [x] Select authored files and verification path without touching generated files
- **Status:** complete

### Phase 3: Implement

- [ ] Add calculation and presentation code following current finance patterns
- [ ] Wire the page into existing finance navigation/routes
- [x] Add calculation and presentation code following current finance patterns
- [x] Wire the page into existing finance navigation/routes
- **Status:** complete

### Phase 4: Verify

- [x] Run focused static verification
- [x] Create, run, and delete a temporary Playwright test
- [x] Run `bun run check`
- **Status:** complete with unrelated repository-gate blocker recorded below

### Phase 5: Delivery

- [x] Inspect the final diff and confirm unrelated work is preserved
- [x] Archive planning notes and provide the required tagged summary
- **Status:** complete

## Constraints

- Do not hand-edit generated or Builder-owned files.
- Do not create permanent tests; the requested Playwright test is temporary.
- Preserve all pre-existing modified and untracked work.
- Do not add policy or guardrail friction for a reporting-only feature.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| PowerShell `rg` received an invalid wildcard path for finance CSS files | 1 | Use explicit files or search the containing directory instead of a Windows wildcard argument |
| Combined hidden Vite start/test/stop command was rejected by the command policy | 1 | Run Vite as a yielded cell, execute Playwright separately, and terminate only that exact cell |
| `bunx @playwright/test` used a separate runner copy from the test import | 1 | Invoke the installed local runner directly with Node |
| The local Playwright CLI launched through Bun hung without output | 1 | Stop that exact yielded cell and invoke the same local CLI with Node |
| First browser harness render failed because `FinanceWorkspaceNav` had no router context | 1 | Wrap the real dashboard component in `MemoryRouter` in the temporary harness |
| Initial text locators crossed element boundaries or matched chart/table duplicates | 1 | Scope assertions to scorecard text and the specific event rows |
| Initial quarter assertion assumed zero-revenue cost would be discarded | 1 | Correct the assertion: aggregate cost includes all period cost while percentage uses summed period revenue |
| Combined recursive artifact cleanup/status command was rejected by command policy | 1 | Inspect the exact artifact path, delete the single generated file with `apply_patch`, and leave the empty directory untracked |
| `bun run check` stopped at unrelated Event Manifest guard failures | 1 | Preserve those user-owned event files; rely on passing feature-scoped typecheck, route test, Playwright, format, and build. Existing issue `#40` already tracks the direct-hook guard blocker |
