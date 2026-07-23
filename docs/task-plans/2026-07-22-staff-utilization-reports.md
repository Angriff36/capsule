# Staff utilization reports

## Outcome

Implemented an authored workforce report at `/staff/utilization` that compares committed shift assignments with confirmed time per staff member and selected period, calculates billable and total hours plus utilization, identifies under-scheduled active staff, and shows peak scheduled demand by weekday or event type.

## Decisions

- Treat `closed` and `corrected` TimeRecords wholly inside the selected dates as confirmed actuals, matching payroll behavior and subtracting recorded breaks.
- Treat event-linked confirmed time as billable, resolving the Event through either the TimeRecord or its linked Shift.
- Treat `scheduled`, `started`, and `completed` Shifts as committed assignments; exclude cancelled and no-show shifts.
- Clip scheduled hours to the report range and split overnight shifts across local weekdays for demand analysis.
- Keep the editable 32-hour weekly under-scheduling benchmark as a clearly labeled browser preference, prorated by report days. It is advisory and never blocks scheduling.
- Keep all implementation in authored React/TypeScript/CSS seams; no Manifest or generated files were changed.

## Implementation

- `src/features/workforce/staffUtilization.ts`: pure staff, actual-hours, assignment-hours, utilization, target-gap, and demand aggregation.
- `src/features/workforce/StaffUtilizationPage.tsx`: generated-query wrapper plus fixture-friendly dashboard, report-period controls, scorecards, staff ledger, attention callout, and demand grouping.
- `src/features/workforce/StaffUtilizationPage.css`: responsive workforce-report presentation.
- Authored workforce route/navigation wiring and workforce system documentation.

## Verification

- `bun run typecheck` — passed.
- Deterministic inline aggregation fixture — passed with 11.5 billable hours, 13.5 total hours, 85.19% utilization, 12 scheduled hours, three under-scheduled staff, Monday peak demand, and Wedding peak event demand.
- `bun run test -- tests/workforce-manifest-integration-guard.test.ts` — 4 tests passed.
- `bun run check:workforce-manifest` — passed.
- `bun run secrets` — passed.
- Targeted Prettier check — passed.
- `bun run build` — passed.
- Temporary Playwright Chromium test — passed in 3.1 seconds; verified report calculations, filtering, under-scheduled names, weekday/event-type demand switching, and target recalculation. The temporary spec, harness, config, results, and directory were deleted. Screenshot evidence remains at `output/playwright/staff-utilization-report.png`.
- `bun run check` — attempted and stopped at unrelated Event integration-guard violations. Open issue #40 was updated with the additional current evidence; broader existing failures are tracked by #60, #64, #62, #63, #65, and #32.
