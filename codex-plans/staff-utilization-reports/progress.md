# Progress: Staff utilization reports

## Session: 2026-07-22

### Phase 1: Requirements and discovery
- **Status:** complete
- Actions taken:
  - Read project execution context and applicable planning/Playwright skills.
  - Captured initial branch (`main`), HEAD (`35b8bc2`), and dirty worktree.
  - Confirmed `npx` is installed for Playwright automation.
  - Inspected workforce documentation, TimeRecord/Shift Manifest sources, route/nav seams, and neighboring weekly/overtime calculation patterns.
  - Confirmed the report can use existing generated list hooks without changing domain or generated files.
  - Matched completed-time semantics to payroll and confirmed target route files were stable across discovery.
- Files created/modified:
  - `codex-plans/staff-utilization-reports/task_plan.md`
  - `codex-plans/staff-utilization-reports/findings.md`
  - `codex-plans/staff-utilization-reports/progress.md`

### Phase 2: Plan
- **Status:** complete
- Actions taken:
  - Defined billable, total, utilization, under-scheduling, weekday demand, and event-type demand semantics.
  - Selected a pure aggregator, fixture-friendly dashboard, thin generated-hook page, page-scoped CSS, and narrow route/nav integration.
  - Set browser verification criteria around confirmed-only actuals, event-linked billable time, break subtraction, assignment filtering, target recalculation, and demand grouping.
- Files created/modified:
  - `codex-plans/staff-utilization-reports/task_plan.md`
  - `codex-plans/staff-utilization-reports/findings.md`
  - `codex-plans/staff-utilization-reports/progress.md`

### Phase 3: Implementation
- **Status:** complete
- Actions taken:
  - Added pure staff utilization, schedule-target, and demand aggregation.
  - Added the report dashboard with date presets/custom dates, browser-local target, per-person table, under-scheduling callout, and demand grouping.
  - Added page-scoped responsive styling and `/staff/utilization` route/navigation wiring.
- Files created/modified:
  - `src/features/workforce/staffUtilization.ts`
  - `src/features/workforce/StaffUtilizationPage.tsx`
  - `src/features/workforce/StaffUtilizationPage.css`
  - `src/features/workforce/workforceRoutes.ts`
  - `src/app/App.tsx`

### Phase 4: Verification
- **Status:** in_progress
- Actions taken:
  - Applied targeted Prettier formatting.
  - Ran `bun run typecheck` successfully.
  - Ran a deterministic inline aggregation fixture successfully.
  - Ran feature-scoped `git diff --check` successfully (only existing line-ending notices).
  - Ran `bun run test -- tests/workforce-manifest-integration-guard.test.ts` successfully (4 tests).
  - Created and ran the required temporary Playwright Chromium spec against a fixture harness around the production dashboard component.
  - Inspected `output/playwright/staff-utilization-report.png` and confirmed the desktop layout has no visible clipping or overlap.
  - Deleted the temporary Playwright spec, harness, configuration, and transient results after the passing run.
  - Ran targeted Prettier check and `bun run build` successfully.
  - Attempted `bun run check`; it stopped at unrelated Event Manifest integration violations before reaching the remaining gates.
  - Confirmed open GitHub issue #40 and added the newly surfaced EventTimelinePanel/CommandFailure violations in comment `#issuecomment-5050270470`.
  - Ran `bun run check:workforce-manifest` and `bun run secrets` successfully.
  - Ran `bun run test:coverage`: 545 tests passed and 17 unrelated baseline tests failed; the major failure classes are already tracked by issues #60/#64/#62/#63/#65/#32.
  - Completed final whitespace/status/line-reference audit and confirmed the temporary spec and harness directory are absent.
  - Updated workforce system truth and archived the implementation plan.
- Files created/modified:
  - None.

## Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| TypeScript | New report compiles with current generated hooks | `bun run typecheck` exited 0 | Pass |
| Aggregation fixture | 11.5 billable / 13.5 total / 85.19%, correct filtering and peaks | Exact expected values printed | Pass |
| Diff whitespace | No whitespace errors in feature files | `git diff --check` exited 0 | Pass |
| Workforce Manifest guard | Existing authored/generated boundary remains valid | 4 tests passed | Pass |
| Temporary Playwright Chromium | Verify totals, utilization, filters, under-scheduling, demand groups, and target recalculation | 1 test passed in 3.1s; temporary test removed | Pass |
| Targeted Prettier | All feature and touched router files formatted | All matched files passed | Pass |
| Production build | Vite emits the utilization page chunk | Build passed | Pass |
| Full repository gate | `bun run check` completes | Blocked at unrelated `check:event-manifest`; issue #40 updated | Blocked (unrelated) |
| Workforce integration script | Current workforce seams remain generated-contract compliant | Passed | Pass |
| Secret scan | No secret leakage introduced | Passed | Pass |
| Full coverage | All tests pass | 545 passed; 17 unrelated baseline failures across 13 files | Blocked (unrelated) |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-07-22 | Windows wildcard passed literally to `rg` | 1 | Switched to file-list filtering. |
| 2026-07-22 | CSS-variable pattern parsed as an `rg` option | 1 | Use the `--` option terminator. |
| 2026-07-22 | First Playwright run expected `78.9%`; rendered value was correctly rounded to `79%` | 1 | Corrected the temporary test expectation before rerunning. |
| 2026-07-22 | Full gate stopped on existing Event Manifest integration violations | 1 | Preserved unrelated files and updated open issue #40 with current evidence. |
| 2026-07-22 | Temp-file absence proof ended with `rg` exit 1 | 1 | Absence is expected; use a conditional existence check next time. |
| 2026-07-22 | Coverage command was killed by the tool's 1-second timeout | 1 | Rerun once with a 120-second timeout. |
| 2026-07-22 | Coverage rerun exposed 17 unrelated shared-baseline failures | 1 | Confirmed existing issue coverage and preserved unrelated files. |
| 2026-07-22 | Combined final-audit regex was malformed by PowerShell quoting | 1 | Use separate simple literal searches. |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1 discovery |
| Where am I going? | Plan, implement, verify, deliver |
| What's the goal? | A verified staff utilization reporting feature |
| What have I learned? | See `findings.md` |
| What have I done? | See above |
