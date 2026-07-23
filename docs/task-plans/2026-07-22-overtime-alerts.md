# Overtime threshold alerts — 2026-07-22

## Outcome

The roster's Schedule shift flow now projects a person's committed weekly hours before calling the generated Shift create mutation. A manager sees an in-page warning with existing, proposed, projected, threshold, and overtime hours, then chooses Review shift or Schedule anyway.

## Implementation

- `src/features/workforce/overtimeProjection.ts` clips scheduled, started, and completed Shift durations into local Monday-to-Monday week windows; cancelled, no-show, deleted, malformed, and other-person rows are excluded.
- `src/features/workforce/RosterPage.tsx` exposes a browser-saved overtime threshold (40 hours by default) and runs the projection before `useCreateShift`.
- The warning is advisory rather than a domain guard, preserving reasonable manager overrides and generated ownership boundaries.

## Verification

- Focused projection: 30 committed + 12 proposed = 42 projected; cancelled/other-person rows excluded.
- `bun run test -- tests/workforce-manifest-integration-guard.test.ts`: 4 passed.
- Scoped Prettier: passed.
- Temporary Playwright/Vite harness around the real `RosterPage`: final run passed 1 test in 4.0s; verified persisted 41-hour target, pre-mutation warning, Review shift path, and single override commit. Temporary spec/config/harness/results were deleted. Screenshot: `output/playwright/overtime-alerts.png`.
- `bun run check` reached and passed toolchain, ownership, proof emission/validation, and registry pin, then stopped on unrelated Event integration issue #58.

## Shared-checkout blockers preserved

- #58 — Event integration guard.
- #69 — missing `PrepTaskDependencies.css` blocks build.
- #70 — malformed `loop-ledger.json` blocks repository format check.
- #71 — generated PrepTaskDependency `predecessorTask` type drift.
- #47 — root-entry baseline cap (current reproduction 58 > 57).
