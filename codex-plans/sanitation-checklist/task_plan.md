# Task Plan: Sanitation Checklist

## Goal
Implement recurring sanitation task definitions by zone, scheduled checklist instances, signed completion, and an inspection-window compliance summary using Capsule's existing authored Manifest and UI patterns.

## Current Phase
Phase 1

## Phases

### Phase 1: Requirements & Discovery
- [x] Capture user requirements and repository constraints
- [x] Inspect current facilities, quality, navigation, Manifest, and scheduling patterns
- [ ] Confirm a non-overlapping authored implementation seam in the dirty checkout (blocked by concurrent active sessions)
- **Status:** in_progress

### Phase 2: Planning & Structure
- [ ] Define the source-first domain model and user workflow
- [ ] Identify generated outputs and the single permitted regeneration path
- [ ] Record acceptance criteria and focused verification path
- **Status:** pending

### Phase 3: Implementation
- [ ] Add authored domain source for definitions, instances, completion, and summaries
- [ ] Regenerate through `bun run manifest:regen` if required
- [ ] Add authored UI and route/navigation integration
- [ ] Preserve unrelated changes and avoid permanent test additions
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] Run focused existing verification
- [ ] Run `bun run check`
- [ ] Create, run, and remove the required temporary Playwright test
- [ ] Record results and resolve proven failures
- **Status:** pending

### Phase 5: Delivery
- [ ] Review the final scoped diff and confirm temporary test removal
- [ ] Archive the completed plan under `docs/task-plans/`
- [ ] Deliver the exact required `<summary>` block
- **Status:** pending

## Key Questions
1. Which existing facility/quality entities and scheduling conventions should this feature extend?
2. Can the feature be implemented without colliding with currently modified files?
3. What authenticated local state is available for Playwright verification at `http://localhost:7811`?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use only authored source and the documented regeneration entry | Generated files are ownership-controlled and must not be hand-edited. |
| Keep verification test temporary | The owner explicitly required a temporary Playwright test and repository rules prohibit unsolicited permanent tests. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Multiple active Codex/Claude sessions are writing this shared checkout | 1 | Stopped before editing shared source or generated files, per repository rules. |


## Notes
- Existing dirty and untracked work predates this feature and must be preserved.
- Stop if active concurrent edits overlap the selected implementation files.
- Current discovery found live agent/tool processes; inspect command lines and recent file churn before proceeding.
- Confirmed live agents include Codex processes started at 10:29 and 11:16 plus a Claude process started at 11:23; this run is the separate Codex process started at 11:34.
