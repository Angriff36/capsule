# Task Plan: Staff Schedule Publish

## Goal
Implement a weekly schedule Publish action that notifies scheduled staff, supports self-service acknowledgement, and warns managers about unacknowledged schedules before the work week begins.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Pin current branch and dirty state
- [x] Confirm no active overlapping edits
- [x] Trace existing shift scheduling, notifications, self-service, and routes
- [x] Read required domain-gating guidance before any Manifest policy change
- **Status:** complete

### Phase 2: Implementation design
- [x] Define the smallest source-first domain and authored UI seam
- [x] Identify generated outputs and the allowed regeneration path
- [x] Record acceptance criteria and verification route
- **Status:** complete

### Phase 3: Implementation
- [ ] Implement authored Manifest and UI/seam changes only
- [ ] Regenerate with `bun run manifest:regen` if Manifest changes are required
- [ ] Preserve unrelated user and generated work
- [x] Implement authored Manifest and UI/seam changes only
- [x] Regenerate with `bun run manifest:regen` if Manifest changes are required
- [x] Preserve unrelated user and generated work
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create and run a temporary Playwright verification test
- [x] Delete the temporary Playwright test after verification
- [x] Run `bun run check` (blocked by unrelated tracked shared-checkout failures)
- **Status:** complete

### Phase 5: Delivery
- [x] Inspect final diff for scope and unrelated changes
- [x] Archive the completed plan under `docs/task-plans/`
- [x] Deliver the required exact `<summary>` block
- **Status:** complete

## Key Questions
1. What existing entity/action represents a weekly schedule and its scheduled staff?
2. Is there already a self-service staff route and notification delivery seam to extend?
3. How is “before the work week begins” represented without adding needless blocking policy?
4. Can regeneration be performed safely in the current dirty shared checkout?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a task-specific plan directory | The shared `codex-plans/` root already contains other active feature plans. |
| Treat all existing changes as user-owned until proven otherwise | The checkout has a broad, likely concurrent dirty delta. |
| Model one `WeeklyScheduleNotice` per person and week | It is both the durable notification and receipt record, avoiding unsupported fan-out reactions while keeping staff acknowledgement explicit. |
| Store the recipient auth subject on the notice | Manifest runtime user ids are external auth subjects; this gives `acknowledge` a trustworthy direct guard without widening the known Person identity gap. |
| Re-publish existing notices and reset acknowledgement | Schedule edits after publication must reach staff as a new version rather than leaving a stale acknowledgement green. |
| Render warnings, never block shift work | The requested manager warning should not deny reasonable operational actions. |
| Use `bun run manifest:regen` after source edits | This is the only approved generation path. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Initial inspection command exited 1 | 1 | `rg` found no memory hits; Git and prerequisite checks completed successfully. |
| Windows `rg` glob paths were rejected | 1 | Use `rg -g '*.manifest' pattern src` instead of a `src/**/*.manifest` path argument. |
| Optional auth seam file read made inspection exit 1 | 1 | The optional file was absent; use the existing `convex/lib/authContext.ts` source. |
| Planning update missed exact context | 1 | Split the bookkeeping change into smaller patches. |
| Auth-pattern inspection exited 1 on an absent optional file | 1 | Read the actual `convex/lib/authContext.ts` seam and continued. |
| Manifest compile rejected reserved command name `publish` | 1 | Renamed the commands to `publishSchedule` and `republishSchedule`; kept the user-facing Publish label. |
| Typecheck rejected nullable summary timestamps | 1 | Narrowed filtered shift timestamps to concrete local variables before formatting. |
| Temporary Playwright harness did not redirect relative imports | 1 | Added a Vite pre-resolution plugin for generated hooks and nonessential child components. |
| First harness bookkeeping patch was malformed | 1 | Split the source and planning edits into valid patches. |
| Playwright `Received` assertion matched two elements | 1 | Scoped the assertion to the exact status badge text. |
| Shell policy blocked removing empty Playwright directories | 1 | Removed the remaining `.last-run.json` with `apply_patch`; all temporary source files are deleted and only empty ignored directories may remain. |
| Full `bun run check` stopped at unrelated Event integration violations | 1 | Confirmed the exact seven violations are already tracked in open bug #58; did not alter concurrent Event work. Run remaining gates separately. |
| Separate format, coverage, and baseline gates found unrelated failures | 1 | Matched them to existing issues #32, #46, #47, #62, #63, #64, #65, and #70; focused workforce tests, build, and secrets pass. |
| Final scoped format check found Roster drift | 1 | Ran Prettier on `RosterPage.tsx`; the scoped format and diff checks now pass. |

## Acceptance Criteria
- A manager can select a week with scheduled shifts and publish one durable notice per scheduled person.
- Each notice includes a human-readable shift count and summary for that person and week.
- Re-publishing a changed schedule updates the summary and clears the old acknowledgement.
- Linked staff see their latest notices in `/my` and can acknowledge once.
- Managers see unpublished, acknowledged, and outstanding counts plus a non-blocking pre-week warning naming outstanding staff.
- No permanent test file remains after Playwright verification.

## Notes
- Do not create or expand permanent tests; the user explicitly requested one temporary Playwright test that must be removed.
- Generated paths must not be hand-edited.
