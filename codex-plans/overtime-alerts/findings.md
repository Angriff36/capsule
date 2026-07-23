# Findings: Overtime alerts

## Requirements
- Sum confirmed shift durations by person for the applicable week.
- Project the total including a proposed new shift assignment.
- Warn scheduling managers before the assignment is committed when projected hours exceed the configured overtime threshold.
- Follow existing repository patterns and generated ownership rules.
- Do not add or expand permanent tests; the owner explicitly requires a temporary Playwright verification test that must be deleted afterward.
- Run the repository-required `bun run check` gate before claiming completion.

## Repository State
- The checkout is heavily dirty with broad existing authored and generated changes.
- Existing changes include `src/workforce/shift.manifest`, `src/features/workforce/RosterPage.tsx`, and `src/features/workforce/TimeSheetPage.tsx`; these must be inspected before any overlapping edit.
- `npx` is available at `C:\Program Files\nodejs\npx.ps1`, satisfying the Playwright skill prerequisite.
- No relevant overtime/weekly-hours memory entry was found; live source is the authority.

## Research Findings
- Canonical workforce entities include both `EventAssignment` and `Shift`.
- `EventAssignment.status` has `assigned`, `confirmed`, `checked_in`, `checked_out`, `no_show`, and `unassigned`; confirmation is an explicit command/event.
- Existing shift scheduling already accepts an optional required qualification and is surfaced on `/staff/roster`.
- The only existing overtime-shaped domain data found so far is finalized `PayrollInput.overtimeMinutes`; no scheduling threshold was found in the first broad search.
- The binding domain guidance says to warn on proportionate harm without inventing low-value blockers; this feature should warn before commit, not deny reasonable scheduling.
- `src/workforce/assignment.manifest` exists and is currently clean in `git status`; `src/workforce/shift.manifest` and `RosterPage.tsx` already have user changes and require exact diff inspection.
- The existing overlapping Shift/Roster changes add optional certification prerequisites and an availability grid. They do not implement overtime, but edits to `RosterPage.tsx` must preserve those additions.
- `EventAssignment` is the only scheduling fact with an explicit `confirmed` status and optional `startsAt`/`endsAt`; `Shift` uses `scheduled`, `started`, `completed`, `cancelled`, and `no_show` instead.
- The current roster UI creates an EventAssignment directly from person/event/role/optional window and separately creates a Shift from person/window/event/role. This makes the exact phrase "confirmed shift durations" ambiguous and requires checking product/feature context before choosing the source records.
- The repository docs currently call recurring schedules and coverage math open decisions; overtime alerts are not documented as an existing domain capability.
- The AboardAI feature record contains no hidden acceptance criteria beyond the supplied description; it is moderate complexity and explicitly targets the current `main` checkout.
- AboardAI reports only one other active feature, `menu-template-library`; it should not overlap workforce source, but a global regeneration would still increase collision risk.
- Organization has no overtime/workweek configuration today. Its manifest currently has user-owned branding additions, so adding a durable Organization threshold would require an overlapping Manifest edit and global Builder regeneration.
- A UI-derived warning can be implemented without changing generated/domain files by projecting committed Shift rows in the authored roster seam; the remaining design choice is how to supply a persistent threshold without adding user tedium.
- Per-browser operational targets already have a repo precedent: `FoodCostPercentagePage` stores its target in `localStorage`. Other lightweight personal settings and recovery state use the same mechanism.
- The shared `useActionPrompt` provides an accessible in-page confirmation panel and is explicitly intended to replace `window.confirm`; it can pause the mutation until a manager chooses to continue.
- Existing copy in the capacity planner explicitly frames operational conflicts as warnings rather than roadblocks, matching the overtime feature's desired tone.
- Focused runtime projection proof produced 30 committed + 12 proposed = 42 projected hours, 2 over a 40-hour threshold, while excluding a cancelled shift and another person's shift.
- The standard Vite server is reachable on the documented port through IPv6 (`[::1]:7811`); the first IPv4-oriented `localhost` probe timed out despite the listener being healthy.
- The repository does not declare Playwright as a dependency, so the required temporary spec will run through Bun's ephemeral package execution and will not modify the lockfile.
- Capsule intentionally has no development auth bypass. A fresh Playwright context cannot safely reach `/staff/roster` without Clerk credentials and valid tenant/role claims.
- Existing feature verification in this same checkout uses a temporary Vite harness with mocked generated transport hooks when authentication is unavailable, while exercising the production component and production calculation module; all temporary files are removed afterward.
- No reusable Playwright storage state or test-user credentials are present. `.playwright-mcp` contains only prior logs/snapshots.
- Final temporary Chromium run passed in 2.8 seconds. It proved a manager-configured 41-hour threshold is persisted, 30 committed hours plus a proposed 12-hour shift produces a 42-hour projection, the mutation count stays zero until confirmation, Review shift returns to the form, and Schedule anyway commits exactly once.
- Screenshot evidence visibly shows the Overtime warning, week, committed/proposed split, one-hour overage, configured threshold, and both Review shift/Schedule anyway choices.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Treat overtime as a warning, not a new domain guard | The requested behavior is advisory before commit, and repository guidance prohibits disproportionate policy friction. |
| Avoid Manifest regeneration unless live evidence proves it is necessary | Another feature is active and regen is repository-global; the warning is inherently a pre-commit UI concern and existing Shift records expose the needed times/statuses. |
| Calculate from Shift rather than EventAssignment | Shift creation is the actual schedule-commit action and has required start/end times; EventAssignment times are optional and confirmation occurs after assignment creation. |
| Browser-saved threshold, default 40 hours | This mirrors the existing food-cost target configuration and avoids adding a tenant schema migration for a pre-commit advisory preference. |
| A local week begins Monday at 00:00 | The repository has no workweek-start setting; this is deterministic and can later be replaced by tenant configuration without changing the projection contract. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Shared checkout has many unrelated changes | Preserve them and inspect overlap before editing. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `docs/architecture/domain-gating-restraint.md` if Manifest guards or policies change

## Visual/Browser Findings
- `output/playwright/overtime-alerts.png` shows the production roster component with the in-page warning above the still-open shift form. The warning text reads 42 projected hours, 30 committed + 12 proposed, one hour over a 41-hour threshold; the four fixture shifts are visible and the cancelled shift is excluded from the projection.
