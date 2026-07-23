# Profit Margin Reports — Findings

## Repository State

- The checkout contains broad intentional in-progress work across generated and authored paths.
- Profit-margin work must remain narrowly scoped and preserve those changes.

## Architecture Findings

- Finance already has adjacent authored reporting slices: revenue trends, food-cost percentage, and printable event cost summaries.
- `EventCloseout` is the authoritative reconciled cost snapshot. It carries actual revenue plus ingredient, waste, labor, vendor, and total actual cost values; finalized closeouts are the safe reporting population.
- The event-cost summary currently maps vendor cost to equipment/vendor hire and waste cost to miscellaneous spend. The new report should retain and explain those current model semantics instead of inventing a new ledger.
- Revenue trends use issued invoices; closeout reporting uses `actualRevenue`. For margins, the governed finalized closeout should stay the single aligned source for both revenue and costs so event profitability does not mix invoice timing with closeout timing.
- Existing finance pages use pure TypeScript report builders plus exported dashboard components, with live pages supplying generated list hooks. This permits browser verification with deterministic fixture data without adding backend mutations.
- Finance navigation already exposes revenue and food-cost reports, but not aggregate margins. A new authored route/page can fit beside them without touching generated code.
- Current client reporting helpers derive display names from person/company fields. Client segment taxonomy needs confirmation from the live `Client` model before implementation.
- The live `Client` model exposes only `clientType` (`company` or `person`) as a durable segmentation dimension. The report will therefore label these as Company clients and Individual clients, plus Unclassified when data is missing.
- Each `Event` has the client relationship and event date needed to roll finalized closeouts up by event, client, and calendar period.
- Existing authored route changes in `App.tsx`, `financeRoutes.ts`, and `FinanceWorkspaceNav.tsx` are already uncommitted from adjacent features. Profit-margin edits must be small additive hunks in those same files.
- A dedicated CSS file imported by the new page avoids colliding with the already heavily modified global stylesheet.

## Reporting Semantics

- Include only non-deleted finalized closeouts with a valid event/date.
- Revenue: finalized `EventCloseout.actualRevenue` (not invoice issue timing), keeping numerator and costs in the same governed snapshot.
- Food: `actualIngredientCost`.
- Labor: `actualLaborCost`.
- Equipment: `actualVendorCost`, matching the existing equipment/vendor-hire interpretation.
- Overheads: `actualWasteCost`, explicitly described as the current overhead/miscellaneous/waste bucket until a dedicated overhead ledger exists.
- Gross profit/margin: revenue less food cost, a recognizable food-service gross-margin view.
- Net profit/margin: revenue less all four cost buckets.
- Calendar period grouping should support month and quarter; the screen should also offer a date-range filter and event/client/period result views.
- CSV should export exactly the active table view and include the applied date range/method fields through clear column headers.

## Final Gate Blocker

- At 2026-07-22 11:13:44 PDT, another session was actively writing `.aboardai` files in this same checkout; the latest write was at 11:13:40.
- Repository instructions require stopping when another session is actively rewriting `C:\Projects\capsule`.
- `bun run check` includes proof emission and ownership checks that may touch shared generated state, so it was not run while the concurrent writer remained active.
