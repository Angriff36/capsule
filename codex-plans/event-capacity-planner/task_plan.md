# Task Plan: Event Capacity Planner

## Goal
Store venue capacity per event, show confirmed headcount versus capacity across a selected calendar date range, and flag overlapping events that share a venue.

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & Discovery
- [x] Capture requested behavior and repository constraints
- [x] Trace current Event/Venue/Guest domain and generated bindings
- [x] Trace existing event calendar/list and routing patterns
- [x] Confirm feature-specific files can be added without racing shared files
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define the smallest source-first domain change
- [x] Define heat-map calculations, date-range UX, and conflict semantics
- [x] Record exact authored/generated file boundaries and verification plan
- **Status:** complete

### Phase 3: Implementation
- [x] Implement source-first domain and generated output through the approved regen path if required
- [x] Implement authored calendar capacity UI and routing
- [x] Preserve all unrelated existing changes
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run focused existing tests without adding permanent tests
- [x] Create, run, and delete a temporary Playwright verification spec
- [x] Run `bun run check` and record its unrelated tracked blocker
- **Status:** in_progress

### Phase 5: Delivery
- [ ] Inspect final diff and verify only intended changes are attributed to this feature
- [ ] Archive the completed plan under `docs/task-plans/`
- [ ] Deliver the exact required `<summary>` block
- **Status:** pending

## Key Questions
1. Does Event already store a venue identifier, capacity, guest count, and a start/end interval?
2. Is there already a date-range calendar or shared heat-map presentation to extend?
3. Can conflicts be computed client-side from the event list, or must the generated domain expose them?
4. Are another session's active edits overlapping the same authored files?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use a feature-specific `codex-plans/event-capacity-planner/` directory | The shared root planning files already belong to other active work. |
| Do not create permanent tests | Repository instructions prohibit adding/expanding tests unless explicitly requested; the user requires only a temporary Playwright test that is deleted. |
| Add nullable `Event.venueCapacity` snapshot | Existing events remain readable, while new venue selections store capacity alongside name/address. |
| Count confirmed guests from non-deleted `EventGuest` rows | This matches “confirmed headcount” rather than substituting the planning estimate. |
| Use half-open overlap semantics (`a.start < b.end && b.start < a.end`) | Back-to-back events at the same venue are not false-positive conflicts. |
| Exclude cancelled/deleted events from heat and conflicts | They do not occupy a live venue booking. |
| Present conflicts as warnings | The feature asks to flag conflicts, and repo policy discourages blocking reasonable operations. |
| Add `/events/capacity` before `/events/:id` and link from the Events header | Keeps the feature discoverable without expanding global navigation. |
| Put visual styles in a new feature-scoped CSS file | Avoids conflicts in the heavily modified global stylesheet. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Initial combined discovery command exited 1 because memory `rg` found no matching entry | 1 | Treat as no relevant memory hit; no retry needed. |
| Playwright config path was missing during discovery while another session had an active test server | 1 | Treat as concurrent temporary-file churn; create isolated temporary verification files only after implementation. |
| Temporary Playwright run under Bun hung with no reporter output and exceeded 120 seconds | 1 | Stopped only its two verified worker processes; move Clerk mint outside the worker and rerun Playwright's Node CLI with an explicit timeout. |
| Node-hosted Playwright reached Clerk's sign-in screen because the ticket had only two seconds to settle before navigation | 2 | Use the repository's proven five-second Clerk ticket consumption flow, verify the route directly, then verify Events-page discoverability. |
| Full `bun run check` stops at four unrelated Event pages that construct direct Convex hooks | 1 | Capacity code already uses generated hooks; confirmed issue `Angriff36/capsule#40`, added current file evidence, and kept unrelated active BEO/timeline work untouched. |

## Notes
- The initial status shows a very large pre-existing dirty tree, including generated ownership paths and event files. Preserve all of it.
- Use `bun` commands only. The user example uses `npx`, but repository conventions and the Playwright skill require adapting to the repo-standard runner.
- A parallel `event-timeline-builder` is intentionally active per `.aboardai/execution-state.json`; avoid its likely shared surfaces until it finishes.
