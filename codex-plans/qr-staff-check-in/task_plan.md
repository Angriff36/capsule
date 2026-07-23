# Task Plan: QR Staff Check-In

## Goal
Implement an event-specific QR flow that lets an authenticated, assigned staff member scan on their phone and create one event-linked TimeRecord clock-in.

## Current Phase
Paused before Phase 3 source edits due to active overlapping writers

## Phases

### Phase 1: Requirements and discovery
- [x] Capture the feature and verification requirements.
- [x] Trace current Event, Shift/assignment, TimeRecord, auth, routing, and UI patterns.
- [x] Identify concurrent changes and safe authored/generated boundaries.
- **Status:** complete

### Phase 2: Technical plan
- [x] Define the minimum domain, Convex seam, route, and UI changes.
- [x] Confirm replay/idempotency and assignment validation behavior without adding user tedium.
- **Status:** complete

### Phase 3: Implementation
- [ ] Implement only authored source changes and use `bun run manifest:regen` if generation is required.
- [ ] Preserve unrelated worktree changes.
- **Status:** pending (blocked by concurrent overlapping edits)

### Phase 4: Verification
- [ ] Run focused existing checks.
- [ ] Create and run a temporary Playwright test for the core QR check-in flow.
- [ ] Delete the temporary Playwright test after the run.
- [ ] Run `bun run check`.
- **Status:** pending

### Phase 5: Review and delivery
- [ ] Inspect the final diff against the initial dirty state.
- [ ] Archive the completed plan under `docs/task-plans/`.
- [ ] Provide the required exact `<summary>` handoff.
- **Status:** pending

## Key Questions
1. Does Shift already represent the staff-to-event assignment, and what field links it to the authenticated user?
2. Can TimeRecord clock-in be expressed through the current Manifest command surface, or is an authored Convex seam required?
3. How does the scan URL preserve the event identifier through Clerk sign-in without exposing a reusable secret?
4. Is another process actively editing overlapping files in this highly dirty checkout?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a feature-specific planning directory | Existing shared planning files belong to other concurrent feature work and must not be overwritten. |
| Treat Playwright spec as temporary only | The user explicitly requires a temporary test, while repo rules prohibit permanent test expansion unless requested. |
| Add `eventAssignmentId` to TimeRecord in Manifest | This directly represents the required event-assignment linkage and lets all projections expose it consistently. |
| Add one authored atomic Convex seam | It can resolve Clerk `authSubjectId`, validate tenant/assignment ownership, prevent conflicting open shifts, transition the assignment, insert the TimeRecord, and emit both domain events in one transaction. |
| Add `/check-in/:eventId` outside AppShell | Staff keep the scanned destination through AuthGate and never see admin navigation. |
| Render each event's absolute check-in URL as a local QR SVG | The event ID provides uniqueness; backend assignment checks, not QR secrecy, authorize the clock-in. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| PowerShell parser rejected a pipeline directly after `foreach` in the overlap snapshot | 1 | Collect rows in an array before piping to `Format-Table`. |
| Active Codex/Claude jobs are writing the exact authored and generated files required by this feature | 1 | Stop before source edits per Capsule shared-worktree rules; resume in an isolated or settled checkout. |
