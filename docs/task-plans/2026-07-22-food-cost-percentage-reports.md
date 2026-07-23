# Food cost percentage reports

## Outcome

Implemented an authored finance dashboard at `/finance/food-cost` that calculates reconciled ingredient cost as a percentage of revenue per finalized event and across rolling weekly, monthly, or quarterly periods.

## Decisions

- Use finalized `EventCloseout` snapshots for both `actualIngredientCost` and `actualRevenue`, keeping numerator and denominator on one reconciled fact.
- Bucket by event service date, with closeout timestamps as a legacy fallback.
- Calculate aggregate ratios from summed dollars, not by averaging event percentages.
- Keep zero-revenue events visible but unscored; their ingredient cost still contributes to any broader period that has revenue.
- Store the operator's target as a clearly labeled browser preference because no organization-level target setting exists in the current domain.
- Add no new guards, policies, approvals, Manifest source, or generated files for this read-only report.

## Implementation

- `src/features/finance/foodCostPercentage.ts`: pure event and period aggregation.
- `src/features/finance/FoodCostPercentagePage.tsx`: dashboard, SVG trend, target control, exact period table, and per-event table.
- `src/features/finance/FoodCostPercentagePage.css`: responsive finance-report presentation and above-target emphasis.
- Authored finance route and workspace-navigation wiring.

## Verification

- `bun run typecheck` — passed.
- `bun run test -- tests/finance-routes.test.ts` — 6 tests passed.
- Temporary Playwright Chromium test — passed; verified a 31.7% aggregate, finalized-only filtering, per-event flags, zero-revenue handling, target recalculation/persistence, and quarterly re-aggregation. Temporary files were deleted.
- Scoped Prettier check — passed.
- `bun run build` — passed.
- `bun run check` — attempted; stopped on pre-existing Event Manifest integration guard failures tracked by issue `#40`, outside this feature's files.
