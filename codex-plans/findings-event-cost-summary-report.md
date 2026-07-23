# Findings: Event Cost Summary Report

## Requirements
- Generate a single-page cost summary for a completed event.
- Combine ingredient cost from received purchases.
- Combine labor cost from approved time records.
- Combine equipment cost from checkout records.
- Include miscellaneous expenses.
- Show invoiced revenue and resulting margin.
- Follow existing authored/generated boundaries and UI conventions.
- Verify the core functionality using a temporary Playwright test, then delete that test.
- Run the repository-required `bun run check` gate before claiming completion.

## Initial Repository State
- Branch: `main`, ahead of `origin/main` by 3 commits.
- The worktree already contains a broad set of modified and untracked files from other feature slices.
- Relevant overlapping dirty paths include `src/features/finance/CloseoutPage.tsx`, finance routes, report pages, invoice manifests, generated Convex output, and `docs/systems/closeout-reporting.md`.
- All pre-existing work must be preserved; overlapping files require read-first, narrow edits.

## Research Findings
- The existing closeout workspace is `/finance/closeout`; the docs describe `EventCloseout` as the canonical reconciliation fact and explicitly warn against maintaining a second summary truth.
- The current Event closeout reaction seeds an `EventCloseout` draft from a closed-out event with budget data and zero actuals; the existing closeout workflow then captures/finalizes reconciled numbers.
- Generated query surfaces already include `listEventCloseoutByEventId` and `listInvoiceByEventId`; further tracing is needed for the remaining input records and exact fields.
- The general `/reports` area is a saved-definition library whose result rendering is explicitly not part of that slice. The cost summary should therefore live with event closeout/finance rather than pretending to be a saved chart definition.
- `package.json` has no permanent Playwright dependency or script. Repository commands are Bun-based; the explicit temporary verification requirement will need a disposable test/runner approach that does not alter dependencies or lockfiles.
- The repository docs flag money/decimal projection as JavaScript numbers whose scale/rounding must be treated carefully in finance/costing UI.
- `EventCloseout` already persists actual revenue, ingredient cost, waste cost, labor cost, vendor cost, total actual cost, gross profit, and budget/headcount reconciliation. Its capture constraints enforce `totalActualCost = ingredient + waste + labor + vendor` and `grossProfit = actualRevenue - totalActualCost`.
- `TimeRecord` has event linkage, clock times, breaks, and closed/corrected status, but no pay rate or approval status. The domain comment explicitly says no pay-rate fields were evidenced. Raw TimeRecords therefore cannot independently produce labor dollars in this checkout.
- Invoices are event-linked and store issued totals/status. Voided invoices must be excluded when representing invoiced revenue; draft/issued state needs a deliberate rule after exact existing UI behavior is checked.
- Existing generated hooks include tenant-wide list access for EventCloseout, Invoice, TimeRecord, Equipment, VendorOrder, and VendorOrderLine. The report can remain in authored React code if those records have the required fields and access policies.
- The current `Equipment` manifest is catalog-only and explicitly says checkout/maintenance entities are later slices. There are no equipment checkout records or event-linked equipment cost fields to aggregate.
- No miscellaneous expense entity was found in the authored Manifest or feature source.
- The current manual closeout capture form collects ingredient, waste, labor, and vendor cost buckets and derives total/profit before capture. It does not expose equipment or miscellaneous buckets, and it does not populate values from source records.
- Event closeout already has the correct UI entry point, finance workspace navigation, and event linkage; a dedicated report route/detail could build on this seam without involving Saved Reports.
- `.aboardai` shows an active parallel `budget-vs-actual-reporting` Codex run that started minutes earlier and is inspecting overlapping event/finance/cost files. Multiple Codex/Claude processes are active in the same dirty checkout.
- The overlapping budget-vs-actual run finished without edits after independently finding the same source gaps. It offered three product directions: add missing models, use manual totals, or show unavailable data.
- The current AboardAI execution state now lists this feature and `ingredient-price-history` as the two active tasks. The latter may touch ingredient/procurement data but does not appear to need the finance route/report files planned here; its completion state must still be checked before edits.
- The ingredient-price-history task is actively changing receipt semantics and procurement source. This feature must not aggregate directly from that moving contract during the parallel run.
- The newly authored revenue-trend slice establishes a local pattern: keep record filtering/calculation in a pure TypeScript module, keep Convex hooks in the page adapter, exclude deleted/voided/written-off invoices, and explain the method in the UI.
- The auto-loop fills the second concurrency slot immediately. The safe implementation seam is limited to finance-owned new files and a narrow `CloseoutPage` edit; no Manifest, generated, procurement, workforce, shared CSS, or route files are needed.
- Implementation stayed inside that seam. Closeout rows now open a printable inline folio; this avoids route ownership and makes printing isolate only the report article.
- A live re-audit after implementation found `PayrollInput` rollups in `src/finance/payroll-input.manifest`, but their rate and gross dollar fields are private/encrypted and their read policy is `financeManageAccess`; using them in the general closeout workspace would add a narrower authorization dependency and still would not represent the requested approved raw time records.
- The same live re-audit still found no event equipment-checkout entity and no miscellaneous-expense entity. `src/facilities/equipment.manifest` remains catalog-only, so the governed `EventCloseout` snapshot remains the only truthful readable four-bucket cost fact for this slice.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Place the report in the closeout/finance seam, not Saved Reports | EventCloseout owns reconciliation; Saved Reports intentionally stores definitions only. |
| Treat stored EventCloseout actuals as canonical when available | Avoid a second summary truth and align with the documented closeout lifecycle. |
| Build a pure report model plus presentational page adapter | Matches the current revenue reporting pattern and makes the core calculation independently verifiable. |
| Sum event-linked invoices except deleted, voided, and written-off records | Matches the current invoice revenue reporting policy and avoids treating cancelled billing as revenue. |
| Compute report margin from invoiced revenue minus reconciled closeout costs | The requested report is invoice-based; this also makes any difference from captured actual revenue visible in the method note. |
| Present vendor cost as `Equipment & vendor hire` and waste cost as `Miscellaneous & waste` | These are the closest truthful existing closeout buckets; the report will explicitly state that raw checkout/expense entities are not yet modeled. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `rg` no-match for expense records caused a combined discovery command to exit 1 | Recorded the absence as evidence and split later reads instead of repeating the command. |
| Active parallel finance/cost task overlaps this feature | Pause before implementation and confirm whether that run has completed; do not race shared edits. |
| Hidden Vite launch rejected before execution | Changed to a yielded foreground server process; no hidden process was started. |
| `bunx @playwright/test test` loaded a duplicate runner | Both local packages are 1.61.1; use the local CLI so the test import and runner share one module instance. |
| Local CLI discovered another session's temporary `output/playwright` spec and timed out | Use an isolated temporary config; verified and stopped only the three Chromium processes spawned by the timed-out invocation. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`

## Visual/Browser Findings
- The rendered folio is legible at Letter proportions: event identity and finalized stamp lead, revenue/cost/margin read as the dominant row, four cost buckets fit in a two-column ledger, and the method/reconciliation notes remain readable below.
- Playwright confirmed the voided invoice is absent and the included invoice numbers are visible.
- The generated print artifact is exactly 1 Letter page (`pdfinfo`: 612 × 792 points, 79,836 bytes).
