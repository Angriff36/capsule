# Production batch yield variance dashboard

## Outcome

Add a read-only production dashboard at `/kitchen/yield` that aggregates completed ProductionBatch yield by component for a selected rolling window, compares planned and actual output, and ranks the largest under-yield first so kitchen leads can target training.

## Decisions

- Use `ProductionBatch.plannedYield` as expected output and `actualYield` as actual output; component catalog yield is a component definition, not the expectation for a specific production run.
- Count only non-deleted batches with `status === "completed"`, a valid `completedAt`, a non-null actual yield, and a positive planned yield.
- Offer 30-, 90-, and 365-day rolling windows ending at the supplied current time.
- Aggregate totals from summed yields, then calculate variance percentage as `(sum(actual) - sum(planned)) / sum(planned)`. Do not average batch percentages.
- Rank negative variance from most negative to least negative. Components meeting or exceeding plan follow under-yield components.
- Keep each component and yield unit as a distinct aggregation row so incompatible units are never summed.
- Use generated read hooks only. Add no Manifest changes, generated edits, commands, guards, policies, approvals, or persistent settings.
- Preserve all existing dirty and untracked work. Do not add permanent tests; the owner-requested Playwright verification is temporary.

## Implementation plan

1. Create `src/features/production/productionYield.ts` with typed batch/component inputs and a deterministic report builder for filtering, aggregation, totals, ranking, and date-window metadata.
2. Create `src/features/production/ProductionYieldDashboardPage.tsx` and scoped CSS for window controls, summary cards, an accessible ranked variance visualization, exact values, and loading/empty states.
3. Wire `/kitchen/yield` through `productionRoutes.ts`, `ProductionWorkspaceNav.tsx`, the culinary navigation catalog, and the existing lazy route pattern in `App.tsx`.
4. Update `docs/systems/production-quality.md` with the shipped route, data semantics, and read-only limitation.
5. Follow a temporary Playwright red/green cycle against the real dashboard component with fixture records passed through its authored data boundary, delete the temporary spec/harness after it passes, then run focused formatting/type/build checks and the required `bun run check` gate.

## Verification criteria

- A completed batch inside the selected window contributes to its component totals.
- Draft, in-progress, cancelled, deleted, incomplete, invalid-date, and out-of-window batches do not contribute.
- Two batches for one component aggregate by summing planned and actual yield.
- The ranking places a larger proportional shortfall before a smaller shortfall or an over-yield.
- Switching from 30 to 90 days includes an older completed batch and updates totals.
- The UI names the component, shows batch count, expected yield, actual yield, quantity variance, percentage variance, and yield unit.
- The empty state explains that completed batches with recorded actual yield are required.
- The temporary Playwright files are removed after the passing run.

## Verification status

- Temporary Playwright Chromium verification passed after an intentional red run for the missing page. It rendered the real dashboard component with fixture records, confirmed completed-only filtering, 30-day totals, component ranking, and the 90-day window recalculation. The temporary spec and harness were deleted; screenshot evidence remains at `output/playwright/production-yield-dashboard.png`.
- `bun run typecheck` passed.
- `bun run build` passed and emitted the lazy ProductionYieldDashboardPage assets.
- `bun run check:production-manifest` passed.
- `bun run secrets` passed.
- `bun run check` was attempted and stopped at pre-existing Event integration failures tracked by open issue `#40` (with related duplicate tracking in `#56`, `#58`, and `#60`).
- `bun run test` completed with 529 passing and 14 pre-existing failures covered by open issues `#32`, `#40`, and `#62`–`#65`; no failure referenced a production-yield feature file.
