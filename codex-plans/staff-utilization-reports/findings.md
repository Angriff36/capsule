# Findings: Staff utilization reports

## Requirements
- Aggregate confirmed time records and shift assignments per staff member per selected period.
- Compute billable hours, total hours, and utilization percentage.
- Identify under-scheduled staff.
- Show peak staffing demand by day of week or event type.
- Follow current repository patterns and generated/authored ownership boundaries.
- Verify core behavior with a temporary Playwright test, run it, then delete it.

## Research Findings
- The checkout starts with a very large pre-existing dirty tree, including workforce, reports, app routing, generated output, and many other in-flight features.
- No directly relevant prior-memory implementation was found; live source must define semantics.
- `npx` is available at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite.
- `docs/systems/workforce.md` defines Workforce as the owner of Shift and TimeRecord operator experiences, with `/staff` routes and generated-query data access.
- `TimeRecord` has `personId`, optional `shiftId`/`eventId`, clock timestamps, break minutes, status, and computed `workedMinutes`; `closed` and `corrected` are the completed/confirmed actuals.
- `Shift` has `personId`, optional `eventId`, start/end timestamps, role, and lifecycle status. Existing `overtimeProjection.ts` documents scheduled, started, and completed as committed; cancelled/no-show rows do not contribute.
- The current domain has no billable flag or staff capacity/target-hours field. A report must derive billable hours from actual time linked to an Event and state any scheduling benchmark as an operator-controlled report threshold, not invent a persistent domain fact.
- Workforce routes are centralized in `workforceRoutes.ts` and rendered by `WorkforceWorkspaceNav.tsx`.
- `App.tsx` owns lazy page loading and `/staff/*` route mounting; the Staff top-level nav already resolves all child paths through `/staff`, so `src/app/nav.ts` does not need a change.
- Existing report features separate pure aggregation from the React page and expose a fixture-friendly dashboard component. That pattern supports deterministic Playwright verification without touching durable data.
- Existing generated hooks provide `useListEvent`, `useListPerson`, `useListShift`, and `useListTimeRecord`; the report can stay read-only and needs no Manifest regeneration.
- Payroll already treats only `closed` and `corrected` TimeRecords as completed, requires the whole record inside the selected inclusive date range, and subtracts non-negative break minutes. Utilization will match that product behavior.
- The report can use custom inclusive start/end dates, while shift assignment demand is clipped to the selected window so cross-boundary shifts contribute only in-range hours.
- The adjacent Roster page and the route/nav/router files retained identical hashes across the discovery window; there is no evidence of an active rewrite racing this task.
- Existing report styling uses Capsule's warm-paper editorial system, IBM Plex Mono for operational numbers, a scorecard, exact-value table, and a transparent method note. The new page will preserve that visual language with a workforce-specific ledger/meter treatment.
- The existing workforce Manifest integration guard still passes all four tests after the authored report addition.
- `@playwright/test` 1.61.1 and its CLI are already present in local `node_modules`, so temporary browser verification can run without package or lockfile changes.
- A neighboring staff-schedule task produced browser artifacts during this session, but the App/router and workforce route hashes stayed stable until this feature's own narrow edits; this task does not touch that task's Roster implementation.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use a feature-specific plan folder | Existing shared planning files belong to other tasks and must not be overwritten. |
| Treat event-linked confirmed time as billable | Event linkage is the only authoritative billable-work signal in the current model; no billable property exists. |
| Treat scheduled/started/completed shifts as assignments | This matches the documented existing projection behavior and excludes cancelled/no-show work. |
| Build a pure aggregator plus a fixture-friendly dashboard component | Matches neighboring report architecture, is easy to verify, and keeps production data access in a thin page wrapper. |
| Use an inclusive custom date range with a 32-hour browser-local weekly planning target | The domain has no staff capacity fact; making the benchmark visible and editable avoids presenting it as authoritative persistent data. The target is prorated by calendar days in the selected period. |
| Calculate utilization as event-linked confirmed hours divided by all confirmed hours | This is the standard meaning supported by existing facts; links inherited through a Shift count as event work. |
| Split scheduled shift hours across local days for weekday demand | This avoids attributing an overnight shift entirely to its start day and gives accurate day-of-week demand. |
| Include active staff plus anyone with in-range activity | Active staff with zero shifts are necessary for under-scheduling; historical contributors must not disappear from a period report. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| PowerShell passed `playwright.config.*` literally to `rg` and produced an invalid filename error | Use `rg --files` and filter the results instead of a shell wildcard. |
| `rg` parsed a CSS-variable pattern beginning with `--` as an option | Add the `--` option terminator before such patterns. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*`
- `docs/systems/workforce.md`
- `src/workforce/*.manifest`
- `src/features/workforce/*`

## Visual/Browser Findings
- Chromium rendered the real dashboard component at 1440px without clipping or overlap. The hierarchy reads clearly from period controls through scorecard, attention callout, staff table, demand peak/bars, and method note.
- The final browser state showed a 4-hour weekly target, 85.2% utilization, 11.5 billable hours, 13.5 total hours, one under-scheduled person (Charlie Park), Wedding peak demand at 8 hours, and Corporate demand at 4 hours.
- A concurrent staff-training task added a separate Training navigation entry during verification. The Utilization entry remained present and active; the unrelated Training change was preserved.
