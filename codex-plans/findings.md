# Findings & Decisions: Payroll data export

## Requirements
- Export approved time records for a selected pay period.
- Include payroll input entries/manual adjustments.
- Include employee ID and hours by type.
- Offer structured CSV or Excel-compatible output for Gusto, ADP, and Paychex.
- Follow current Capsule patterns and generated-file ownership boundaries.
- Verify core behavior with a temporary Playwright test, then delete that test.
- Run the required repository gate before claiming completion.

## Research Findings
- The checkout is on `main` and already has extensive modified/untracked work.
- Existing changes include workforce UI, Manifest source, generated files, shared styles, and package configuration; these are user-owned until proven otherwise.
- `package.json` already exposes `check:payroll-manifest` and includes it in `bun run check`, indicating a payroll domain seam may already exist.
- `npx` is available, satisfying the Playwright skill prerequisite, but repository commands must use Bun where a project-local command is available.
- Existing `PayrollInput` is a manually prepared person/period rollup with regular and overtime minutes, optional gross amount/notes, and `prepared` → `finalized`/`voided` lifecycle.
- Existing `TimeRecord` has only `open`, `closed`, and `corrected` states. There is no durable approval command or approval timestamp; closed/corrected records are the only completed, payroll-ready records available without a domain/regeneration change.
- `Person.employeeNumber` exists and is the correct payroll employee identifier; the document id can be an explicit fallback for incomplete roster data.
- The current docs explicitly say automatic aggregation into payroll numbers is deferred; this feature will add authored, read-only compilation/export rather than a second persistence path.
- Official Gusto Smart Import accepts CSV/XLS/XLSX without a fixed layout and automatically maps columns; zero values overwrite existing payroll data while blanks do not.
- Official ADP material identifies Employee ID plus `REG` and `OTP` earning codes for regular/overtime hours, but client-specific payroll setup still controls import details.
- Official Paychex materials confirm CSV import, worker/employee IDs, payroll-template/import mapping, and separate regular/overtime concepts; client-specific codes/templates remain configuration-dependent.
- Authorization trace: `finance_manager` owns the payroll workflow but lacks `workforceAccess`, so generated `listTimeRecord` returns an empty array for the primary payroll role. GitHub issue #39 tracks the required Manifest policy correction and regeneration.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Inspect live authored source and diffs before choosing files | Avoid colliding with current work or rebuilding an existing partial feature |
| Add a read-only export builder and controls to the existing payroll page | Fits existing finance ownership and avoids generated/domain writes |
| Treat closed/corrected time as payroll-ready, while stating the model limitation in UI/docs | The live source has no separate approval state; inventing a local approval flag would be false governance |
| Export UTF-8 CSV with processor-oriented profiles | CSV is accepted by the named processors and opens cleanly in Excel; no new dependency is needed |
| Keep manual payroll entries visibly distinct in the exported data | Prevents the exporter from disguising manual input as clock-derived time |
| Do not weaken or bypass TimeRecord policy in authored UI code | The correct fix belongs in Manifest source plus Builder regeneration; issue #39 records it |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Initial combined read command ended nonzero on a Windows wildcard | Logged and will use explicit paths/file discovery |
| A second search used PowerShell-incompatible glob arguments | Logged; subsequent searches use `rg --files` or directory roots only |
| Brave Search helper path/API key were unavailable | Used built-in web lookup restricted to official processor sources |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `src/features/workforce/`
- `src/features/finance/PayrollPage.tsx`
- `src/features/finance/PayrollPrepareForm.tsx`
- `src/finance/payroll-input.manifest`
- `src/workforce/time.manifest`
- Gusto Smart Import: https://support.gusto.com/article/999914471000000/run-payroll-with-smart-import
- ADP Payroll Data Input API guide: https://developers.adp.com/articles/preview/guide-pay-data-input-api-guide-for-vantage-hcm-6?chapter=2
- Paychex Standard Payroll Import specification search result: https://myapps.paychex.com/pngHelp_static/helpHtml/SPI_Specification_Sheet.htm

## Visual/Browser Findings
- None yet.

## Whole-spec audit baseline — 2026-09-20
- Required origin/main 89262916 is already ancestor of dev be4288fb; git pull --no-rebase origin dev reports up to date.
- Existing acceptance IDs AC-001 through AC-046 must remain stable; startup IMPLEMENTATION_PLAN.md is empty.
- Preview 127.0.0.1:7813 source map identifies C:/Projects/capsule/src/main.tsx; served Vite source points to local backend 3210. Convex dev parent and local storage paths identify this checkout; authStatus:getAuthStatus returns the expected anonymous response.
- bun run check passes ownership/proof/domain/design/typecheck gates then stops at format:check on preserved startup-owned loop-ledger.json. Do not edit or stage that unrelated file. Run remaining checks separately and report the full gate honestly.
- All 19 Ralph specs assigned to 8 read-only worker processes; complete Markdown/JSON product and backend contract audits follow.


- Existing full suite passed: 193 test files, 892 tests; coverage thresholds passed. Frontend build and secrets passed. manifest:regen:check passed with no owned-file drift.
- baseline:decay separately fails at 75 roots versus cap 71. HEAD has exactly 71 roots; ignored .ralph-tasks, .ralph-workers.log, IMPLEMENTATION_PLAN.md.bak and owner-owned untracked capsule-backend-end-state-spec.md inflate the runtime count. Escalated https://github.com/Angriff36/capsule/issues/380.
- No skipped/todo/only test declarations found by source sweep; TODO commit/revert branches exist in convex/importCoordinator.ts and must be assessed against live importCommit consumers, not called universal missing imports.
- Read-only issue refresh: 142/143/145/146 remain open; 144/147/148/149/150/151 are closed. Issue state is not workflow proof.
- src/lib/llm-review.ts exists but review-criteria.md and llm-review.test.ts contain sample design-professional/financial-services criteria; normal Vitest include is tests/**/*.test.ts, so the passing suite does not run those perceptual reviews.

## Whole-spec synthesis — 2026-09-21
- Reviewed all 22 spec files and all 115 src/lib files; normative complete-product Markdown/JSON share criteria, while stale status tables are not evidence.
- Published 115 prioritized task groups and 727 stable criteria (40 retained PASS, 687 PENDING); all 164 Ralph checkboxes and every backend explicit suite leg map to tasks.
- Corrected false negatives about cancellation, reminders, attribution pages, recipe methods/stations/images, and source-estimate honesty. Full decisions and evidence: codex-plans/whole-spec-audit-2026-09-20/.
- Reopened AC-012/024/029/030 for the missing full outcomes, retaining their passing narrower evidence. No source criterion retired; no application/test implementation.
- Escalated source-confirmed tooling/release/provider/lifecycle/privacy/cutover/stock blockers as issues #380 through #387. User-owned files remain untouched apart from the requested plan target.
