# Task Plan: Venue logistics profile

## Goal
Add reusable venue logistics details that operators can maintain once, view from every linked event, and include in BEO output.

## Current Phase
Phase 1 — discovery

## Phases

### Phase 1: Requirements and discovery
- [x] Read task, governing instructions, design and component guidance
- [ ] Map current Venue, event detail, and BEO data paths
- **Status:** in_progress

### Phase 2: Design and implementation plan
- [ ] Confirm minimal additive manifest and UI approach
- [ ] Identify regeneration and verification commands
- **Status:** pending

### Phase 3: Implementation
- [ ] Add venue logistics fields and projection
- [ ] Regenerate owned output
- [ ] Add event/BEO presentation
- **Status:** pending

### Phase 4: Verification
- [ ] Run focused checks and repository gates
- [ ] Run temporary Playwright verification and remove it
- **Status:** pending

### Phase 5: Handoff
- [ ] Inspect diff and report exact changes
- **Status:** pending

## Decisions Made
| Decision | Rationale |
| --- | --- |
| Extend the existing Venue entity | A single current profile belongs naturally to one venue and avoids a new relation or duplicate profiles. |

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
