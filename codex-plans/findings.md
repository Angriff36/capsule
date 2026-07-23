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
