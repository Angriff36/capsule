# Task Plan: Restore list state on record return

## Goal
Preserve list URL state, scroll offset, and safe return behavior across supported Capsule lists and record details.

## Current Phase
Phase 1 (round-3 remediation)

## Phases

### Phase 1: Requirements and discovery
- [ ] Revalidate the prior implementation against the rejection findings
- [ ] Map each affected list's controls and detail-origin paths
- **Status:** in progress

### Phase 2: Design
- [ ] Establish stable URL-state and visit classification contracts
- [ ] Define scroll restore/cancellation behavior for shell and virtual list
- **Status:** pending

### Phase 3: Implementation
- [ ] Complete shared managers and route integrations
- [ ] Split touched list modules below the requested size limit
- **Status:** pending

### Phase 4: Verification
- [ ] Run the temporary authenticated Playwright proof and retain artifacts
- [ ] Run `bun run check` to completion and resolve feature-caused failures
- **Status:** pending

### Phase 5: Delivery
- [ ] Inspect the complete diff and leave a review-ready tree
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|---|---|
| Preserve and correct the existing feature diff | The worktree already contains the task's incomplete implementation. |
| Store origin by router entry key and history index | A saved URL alone cannot prove that Back returns to the originating list. |
| Restore virtual Kitchen lists through their imperative API | The virtual window must update both DOM offset and React row state. |
| Preserve pre-existing gate failures | They are outside this navigation feature and must not be changed merely to force green. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| JSX in `listOrigin.ts` | 1 | Renamed the shared JSX component module to `.tsx`. |
| Port 7812 already occupied | 1 | Used isolated port 7813 and recorded it in verification evidence. |
| Playwright runner API mismatch | 1 | Used a temporary Playwright browser API script instead of the incompatible runner. |
| Isolated browser lacks an authenticated session | 1 | Captured the blocked UI and assertion output; did not claim list-flow proof. |
