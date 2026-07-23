# Task Plan: Event Cost Summary Report

## Goal
Implement and verify a single-page completed-event cost summary that combines received ingredient purchases, approved labor time, equipment checkout cost, miscellaneous expenses, invoiced revenue, and resulting margin.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Capture user requirements and repository constraints
- [x] Trace current domain models, generated bindings, finance/report routes, and UI patterns
- [x] Identify overlapping user changes and safe authored seams
- **Status:** complete

### Phase 2: Implementation Plan
- [x] Define aggregation rules and unavailable-data behavior from actual model fields
- [x] Choose the smallest authored UI/domain seam consistent with existing patterns
- [x] Record exact files and verification commands
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the report without hand-editing generated/owned files
- [x] Preserve unrelated dirty work
- [x] Keep the report printable and usable as a single-page summary
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create and run a temporary Playwright test for core report behavior
- [x] Delete the temporary verification test
- [x] Run `bun run check` and record the unrelated shared-tree blockers
- **Status:** complete

### Phase 5: Delivery
- [x] Review the final diff and confirm only intended authored files changed
- [x] Update planning/fixes logs
- [x] Provide the required exact `<summary>` handoff
- **Status:** complete

## Key Questions
1. Which existing records and statuses represent received purchases, approved time, equipment checkouts, miscellaneous expenses, and invoiced revenue?
2. Does the current generated contract expose enough query data, or should the feature aggregate existing list results in an authored UI helper?
3. Where should users open the report for a completed event, and how does the current routing/navigation express event-scoped finance views?
4. What deterministic seed/test state is available for Playwright without adding permanent tests?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use feature-specific planning files | Existing generic planning files belong to other in-progress work and must be preserved. |
| Do not use the fable-only Codex delegation workflow | The active agent is Codex, while the supplied context explicitly scopes that workflow to fable. |
| Use EventCloseout as the canonical cost snapshot and event-linked invoices for billed revenue | Raw labor/equipment/misc source models do not exist, while closeout is explicitly the governed reconciled fact. |
| Preserve existing bucket meanings in labels | Show `actualVendorCost` as equipment and vendor hire, and `actualWasteCost` as miscellaneous and waste; explain this provenance rather than claiming unavailable source records were queried. |
| Render inside CloseoutPage instead of adding an app route | Avoids overlap with active parallel route work and keeps the report next to its owning closeout folio. |
| Add only scoped CSS | Avoids the actively modified shared stylesheet. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Combined PowerShell discovery command exited 1 when `rg` found no expense matches | 1 | Treat no-match as evidence, split subsequent reads, and avoid retrying the same combined command. |
| Expected `playwright.config.ts` was absent | 1 | Use an exact-path temporary Playwright spec with an in-process disposable Vite fixture; do not add repository config. |
| Playwright rejected `test.beforeAll` because the CLI and `@playwright/test` resolved to different installed copies | 1 | Import `test` and `expect` from the CLI-matched `playwright/test` package before the second run. |
| Hidden `Start-Process` Vite launch was blocked by command policy | 1 | Use a yielded foreground server cell and terminate that exact cell after Playwright. |
| Ephemeral Playwright runner conflicted with the repo-local runtime and found no tests | 1 | Invoke the matching local `node_modules/@playwright/test/cli.js` runner directly. |
| Local Playwright run timed out after discovering another temporary spec under `output/playwright` | 1 | Stop its verified orphan Chromium root and add a temporary config that matches only `.playwright-mcp/event-cost-summary.spec.ts`. |
| `bun run check` stopped at the Event Manifest guard | 1 | Preserve unrelated `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx`; record the blocker and run scoped type, format, Playwright, and build gates. |
| Repository-wide format/test gates failed on active unrelated files | 1 | Confirm the four finance files pass targeted Prettier and production build; report the 12 unrelated test failures without modifying their owners. |
| Final `rg` line-reference pattern was malformed by PowerShell quoting | 1 | Use literal fixed-string searches for the final component references; no implementation files were affected. |

## Notes
- Generated and Builder-owned paths must not be hand-edited.
- Existing tests may be run, but no permanent tests may be added unless the owner asks.
- Temporary Playwright verification is explicitly required by the feature task and must be deleted afterward.
- Planned authored files: `src/features/finance/eventCostSummary.ts`, `src/features/finance/EventCostSummaryReport.tsx`, `src/features/finance/EventCostSummaryReport.css`, and a narrow edit to `src/features/finance/CloseoutPage.tsx`.
- Focused verification: `bun run typecheck`, temporary Playwright browser test against a disposable Vite fixture, then `bun run check`.
- Final verification: focused checks pass; the required full gate was attempted but remains blocked by unrelated active Event API-path, navigation, formatting, and generated invoice-policy failures.
