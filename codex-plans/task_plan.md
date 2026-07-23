# Task Plan: Payroll data export

## Goal
Compile approved workforce time records and payroll input adjustments for a selected pay period into downloadable Gusto, ADP, and Paychex-compatible CSV/Excel-oriented exports.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace current workforce/payroll domain, routes, and authored UI seams
- [x] Identify existing work in the dirty checkout
- **Status:** complete

### Phase 2: Plan the authored implementation
- [x] Define data source, export model, formats, and UI flow
- [x] Confirm generated paths remain untouched
- **Status:** complete

### Phase 3: Implement
- [x] Add the smallest authored code changes matching existing patterns
- [x] Preserve unrelated user changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused static checks
- [x] Create, run, and delete a temporary Playwright verification spec
- [ ] Run `bun run check`
- **Status:** pending — blocked by unrelated concurrent Manifest compilation and test failures

### Phase 5: Delivery
- [x] Review exact diff and repository status
- [x] Keep the plan unarchived because the required full gate is blocked
- [x] Provide the required tagged summary
- **Status:** complete

## Key Questions
1. Which authored payroll/time entities and generated hooks already exist?
2. Is the feature partially implemented in current user-owned changes?
3. What export column layouts are already established by the repository?
4. What authenticated or mockable browser state can verify the export safely?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Avoid every generated/Builder-owned path | Required by repository ownership rules |
| Treat all pre-existing changes as user-owned | Checkout was dirty before this task |
| Build in `src/features/finance/payrollExport.ts` and the existing `PayrollPage` | Keeps logic authored, pure, reviewable, and colocated with payroll UI |
| Use closed/corrected records as payroll-ready input | No separate approval state exists in live domain; local approval would be misleading |
| Use UTF-8 BOM CSV profiles for Gusto, ADP, and Paychex | Supported spreadsheet interchange without new runtime dependencies |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| PowerShell `rg` received an invalid wildcard path for `playwright.config.*` | 1 | Use `rg --files`/explicit file discovery instead of a Windows wildcard argument |
| PowerShell `rg` received invalid `src/*.manifest` glob arguments | 1 | Search directory roots or discovered file lists instead |
| Brave Search helper unavailable and `BRAVE_API_KEY` absent | 1 | Use the built-in official-domain web lookup |
| Playwright reported no tests under `.artifacts/` | 1 | Move the temporary spec to the repository root for default test discovery |
| Planning update patch did not match Prettier's compact heading whitespace | 1 | Re-read the file and apply against the exact formatted text |
| `bun run check` stopped in `proof:emit` on an in-progress preferred-vendor Manifest change | 1 | Preserve the concurrent session's files; run payroll-focused gates and report the shared-worktree collision |
| Combined focused verification was killed by an intentionally short shell timeout | 1 | Split formatting, typecheck, payroll tests, full tests, and build into independently timed commands |
| `bun run test` exposed 12 unrelated failures in concurrent Event/navigation/generated work | 1 | Preserve unrelated changes; record that payroll's focused 12 tests pass |
| Finance managers cannot read TimeRecords used by the payroll exporter | 1 | Filed GitHub issue #39; do not race the active generated-tree rewrite with regeneration |
