# Findings: Food cost percentage reports

## Repository state

- Active checkout: `C:\Projects\capsule`, branch `main`, starting HEAD `b080022`.
- The worktree is heavily dirty with concurrent/user-owned feature work. All existing changes are out of scope and must be preserved.
- Existing adjacent authored finance work includes event cost summary and revenue trend files; these are useful patterns but remain user-owned until the exact overlap is understood.
- Generated and Builder-owned paths are explicitly off limits.

## Discovery notes

- `EventCloseout` is the governed, immutable reporting fact once finalized. It already stores `actualRevenue`, `actualIngredientCost`, `capturedAt`, `finalizedAt`, and the linked `eventId`.
- Event rows provide the operational date (`startsAt`) and display identity. The reporting date should be event start, with finalized/captured timestamps only as legacy fallbacks.
- The existing event folio and revenue dashboard exclude deleted, voided, and written-off invoices, but invoice revenue can diverge from reconciled closeout revenue. Food cost percentage will use closeout `actualRevenue` so numerator and denominator come from one reconciled snapshot.
- Aggregate percentage must be `sum(food cost) / sum(revenue)`, never an average of event percentages.
- Only finalized, non-deleted closeouts count. Draft closeouts remain mutable and should not affect the report.
- Existing finance reporting uses week/month/quarter rolling windows, direct SVG charts, `FinanceWorkspaceNav`, generated list hooks, accessible exact-value tables, and explicit method notes.
- No persisted organization-level target exists in the live domain. A browser-local target is the narrow authored seam and avoids inventing generated configuration or policy work. It should be clearly labeled as saved for this browser.
- Periods above target are flagged only when revenue is positive and the ratio is calculable; zero-revenue periods remain visibly unavailable rather than being treated as healthy.

## Implementation plan

- Add a pure `foodCostPercentage.ts` report builder for per-event rows, aggregate totals, rolling periods, and target variance.
- Add `FoodCostPercentagePage.tsx` plus scoped CSS using the existing finance report visual language, with target input, week/month/quarter controls, ratio trend, flagged periods, and exact per-event values.
- Wire `/finance/food-cost` through authored finance routes/navigation and `App.tsx`.
- Use existing generated `useListEvent` and `useListEventCloseout` hooks only; do not change Manifest or generated files.
