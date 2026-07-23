# Task Plan: Staff utilization reports

## Goal
Implement a workforce report that aggregates confirmed time records and shift assignments by staff member and period, shows billable/total hours and utilization, and surfaces under-scheduling and peak demand.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Inspect current workforce domain, routes, report/UI patterns, and live worktree overlap
- [x] Record authoritative source and generated-file boundaries
- **Status:** complete

### Phase 2: Plan
- [x] Define calculation semantics from existing model fields
- [x] Choose authored implementation seams and browser acceptance criteria
- **Status:** complete

### Phase 3: Implementation
- [x] Implement the scoped report without touching generated files or unrelated work
- [x] Integrate routing/navigation using existing patterns
- **Status:** complete

### Phase 4: Verification
- [x] Run focused static/runtime checks
- [x] Create, run, and delete the required temporary Playwright test
- [x] Run `bun run check` (attempted; unrelated Event guard blocker recorded and escalated)
- **Status:** complete with unrelated repository-gate blockers recorded

### Phase 5: Delivery
- [x] Inspect final diff and confirm temporary test removal
- [x] Archive the completed plan under `docs/task-plans/`
- [x] Provide the exact required summary format
- **Status:** complete

## Key Questions
1. Which existing fields authoritatively define confirmed time, billable time, shift assignments, period dates, staff identity, and event type?
2. Is the current dirty worktree actively changing relevant workforce/report/app files?
3. What existing report presentation and route patterns should this feature follow?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Work only in authored seams | Repository rules prohibit hand-editing generated surfaces. |
| Preserve all pre-existing dirty files | The checkout contains substantial concurrent work that belongs to the user. |
| Add `staffUtilization.ts`, `StaffUtilizationPage.tsx`, and page-scoped CSS | Keeps calculation, presentation, and styling authored and isolated. |
| Add only narrow router/nav entries | The top-level Staff nav already covers the child route and generated files are unnecessary. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg` rejected literal Windows wildcard `playwright.config.*` | 1 | Use `rg --files` piped through a filename filter. |
| `rg` treated a CSS-variable search beginning with `--` as a flag | 1 | Use `rg -- <pattern>` when the search pattern begins with hyphens. |
| First Playwright row assertion expected `78.9%`, while the UI rounded 78.95% to `79%` | 1 | Correct the temporary assertion to match the configured number formatter. |
| `bun run check` stopped at pre-existing Event Manifest integration violations | 1 | Preserve unrelated event work and update open GitHub issue #40 with the additional current violations. |
| Combined issue/status proof command exited 1 because its final `rg --files` found no deleted temp files | 1 | Treat absence as the desired proof and use an explicit conditional for future checks. |
| Coverage run was terminated by a 1-second shell timeout before Vitest reported results | 1 | Rerun coverage once with a 120-second execution window. |
| Full coverage completed with 17 unrelated failures across Event/Supply guards, stale expectations, generated invoice authorization, and proof timeouts | 1 | Confirmed existing issues #60/#64/#62/#63/#65/#32; do not alter shared unrelated work. |
| Final audit `rg` expression lost a quoted literal under PowerShell and produced an unclosed-group error | 1 | Split line-reference searches into simple literal patterns. |

## Notes
- No permanent tests may be added unless the owner asks; the Playwright test is temporary and must be deleted.
- `bun run check` is the required repository gate.
