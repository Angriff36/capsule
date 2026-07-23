# Task Plan: Overtime alerts

## Goal
Calculate projected weekly confirmed-shift hours per person and warn scheduling managers before committing an assignment that crosses the configured overtime threshold.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Capture feature requirements and repository rules.
- [x] Trace shift, assignment, confirmation, person, configuration, and scheduling UI paths.
- [x] Inspect current overlapping changes and generated ownership boundaries.
- **Status:** complete

### Phase 2: Implementation plan
- [x] Select the smallest authored seam that matches existing patterns.
- [x] Define week-boundary, duration, threshold, and warning behavior.
- [x] Record implementation and verification scope.
- **Status:** complete

### Phase 3: Implementation
- [x] Implement projected-hours calculation and pre-commit warning.
- [x] Preserve unrelated user changes and generated boundaries.
- [x] Regenerate only through `bun run manifest:regen` if domain changes require it (not required; no domain/generated files changed).
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing verification.
- [x] Create, run, and delete a temporary Playwright test for the core flow.
- [x] Run `bun run check` (blocked at unrelated Event guard; focused/downstream results documented and escalated).
- **Status:** complete

### Phase 5: Review and delivery
- [x] Inspect the final diff and repository status.
- [x] Archive the completed plan under `docs/task-plans/`.
- [x] Prepare the required `<summary>` block.
- **Status:** complete

## Key Questions
1. Where is a new worker assigned to a shift, and when is that assignment committed?
2. What existing status represents a confirmed shift or confirmed assignment?
3. Is an overtime threshold already modeled or configured?
4. What local authenticated test state can Playwright use at `http://localhost:7811`?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep planning artifacts under `codex-plans/overtime-alerts/` | Avoid overwriting other active feature plans in this heavily dirty shared checkout. |
| Warn from the authored Shift creation flow | `useCreateShift` commits a Shift directly into `scheduled`; this is the last pre-commit UI seam and avoids changing generated code. |
| Count `scheduled`, `started`, and `completed` Shift rows | These are committed scheduled-work states; `cancelled` and `no_show` no longer represent worked/committed duration. |
| Use local Monday-to-Monday week windows and clip overlapping durations | Produces correct per-week actual durations, including shifts that cross week boundaries. |
| Default to 40 hours and persist manager changes in browser storage | Matches an established operational-target pattern, keeps the threshold configurable, and avoids global regen collisions. |
| Use the shared in-page action prompt for the warning | It visibly pauses before mutation, supports an explicit continue choice, and avoids native browser prompts. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Memory keyword search returned no matches and exit code 1 | 1 | Treat as no relevant memory hit and continue from live repository evidence. |
| PowerShell/rg quoting produced an unclosed regex while searching warning UI patterns | 1 | Split the search and use single-quoted PowerShell regex arguments. |
| Guessed `ActionPromptHost.tsx`, which does not exist | 1 | Use `rg --files src/ui/action-prompt` and inspect only confirmed files. |
| Combined reference-read command returned exit 1 because an `rg` pattern had no matches | 1 | Avoid treating optional searches as required; inspect the confirmed files directly and explicitly tolerate no-match searches. |
| TypeScript did not narrow optional `shift.endsAt` through the interval helper | 1 | Capture both endpoints locally and guard their number types before calculating overlap. |
| `http://localhost:7811/staff/roster` refused the verification connection | 1 | Start the documented `bun run dev` server in a hidden background process, verify it, then stop only that process. |
| Background `Start-Process` command was rejected by the execution policy | 1 | Run `bun run dev` in a tracked long-running tool cell and terminate that exact cell after Playwright. |
| Temporary Playwright ESM config referenced CommonJS-only `__dirname` | 1 | Derive the config directory from `import.meta.url` before rerunning. |
| First browser run rendered blank because Vite did not apply absolute-path aliases to relative production imports | 1 | Match the exact relative import specifiers used by `RosterPage`; diagnostic browser output confirmed the failure was a missing Convex provider, not feature code. |
| Playwright's substring label match selected both Person and certification controls | 1 | Use an exact accessible-label match for the Person select. |
| Exact label match found no Person select because the wrapping label's accessible name includes option text | 2 | Target the form's stable `name="personId"` control instead of repeating label matching. |
| Full `bun run check` stopped at seven unrelated Event integration guard violations | 1 | Verified the exact blocker is already tracked in open GitHub issue #58; preserve Event files and run overtime-relevant/downstream gates independently. |
| First GitHub issue command used PowerShell-unsafe Markdown escaping | 1 | Use a single-quoted here-string for issue bodies; issue #69 was created successfully on the next attempt. |
| Rerun TypeScript observed new concurrent generated PrepTaskDependency drift | 1 | Confirmed the overtime files passed before the drift, preserved generated code, and opened issue #71. |
