# Findings: Food cost percentage reports

## Requirements

- Calculate food cost percentage per event.
- Aggregate the ratio by period.
- Trend the ratio over time.
- Benchmark against an operator target percentage.
- Flag periods that exceed the target.
- Verify the core flow with a temporary Playwright test and delete it afterward.

## Research Findings

- The checkout is on `main` with extensive pre-existing modified and untracked work.
- Adjacent untracked finance work includes an event cost summary and a revenue trends page; these are user-owned until proven otherwise.
- Generated and Builder-owned paths must not be hand-edited.
- `foodCostPercentage.ts`, `FoodCostPercentagePage.tsx`, and `FoodCostPercentagePage.css` appeared at 08:49:26 after the initial status snapshot, while matching App/finance-route changes landed at 08:49:15. Another session is actively implementing this exact feature.
- The incoming implementation already computes finalized-closeout ingredient cost divided by actual revenue, weighted aggregate percentages, weekly/monthly/quarterly periods, event rows, target variance, and above-target flags.
- The target is currently an operator-adjustable browser-local preference with a 30% default; no generated/domain edit was introduced for it.
- `EventCloseout` is the authoritative immutable finance snapshot after finalization and exposes `actualRevenue`, `actualIngredientCost`, event linkage, and finalization state. The incoming report reads only finalized, non-deleted closeouts.
- Aggregate percentages correctly use `sum(actualIngredientCost) / sum(actualRevenue)` rather than averaging event percentages.
- Event service start determines the reporting period, with finalized/captured timestamps as fallback only when the linked event date is unavailable.
- Zero-revenue results are retained in event/period totals but intentionally return an unscored ratio rather than dividing by zero.
- The incoming UI includes weekly, monthly, and quarterly windows; an SVG trend with a target line; aggregate scorecards; exact period values; event-level breakdown; target variance language; and above-target styling.
- Finance role policy already permits reading closeouts. Event lookup policy still needs verification because a finance-only role may not have event read access.
- AboardAI's feature output shows an earlier task actor independently chose the same finalized-closeout semantics and created its own feature plan and root-level disposable Playwright harness.
- That external harness changed at 08:56:18 but had no matching live Playwright process during a later ten-second quiet check. Its files remain separate from this agent's successfully deleted temporary harness.

## Decisions

| Decision | Rationale |
| --- | --- |
| Inspect the live finance files and their diffs before choosing an implementation seam | Avoid duplicating or colliding with adjacent user work |
| Do not edit the food-cost slice while its external writer is active | Shared-worktree changes appeared during read-only discovery; racing them risks data loss |
| Treat finalized EventCloseout snapshots as the finance source of truth | Matches the live Manifest lifecycle and avoids mixing mutable invoice projections into reconciled reporting |
| Keep weighted period and window ratios | This is the financially correct aggregate and the UI explicitly explains it |
| Accept the browser-local target for this slice | It is explicit, editable, durable for the operator's browser, and avoids unsafe domain regeneration in the actively dirty generated tree |
| Verify the real exported dashboard component with deterministic closeout data | Proves calculations and browser behavior without depending on Clerk or mutating durable data |
| Do not delete the root-level verification harness while ownership is still ambiguous | It was created by the other task actor and changed during this session; wait for a quiet handoff before deciding whether cleanup is safe |
