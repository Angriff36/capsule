# Task Plan: Derived serving ware and smallwares pack-out

## Goal
Generate configurable serving-ware and smallwares pack-list quantities from an event's menu, headcount, and service style while preserving manual work.

## Current Phase
Phase 1 — discovery

## Phases

### Phase 1: Requirements and discovery
- [ ] Inspect existing Manifest, pack-list, menu, and UI patterns.
- [ ] Record constraints and existing ownership boundaries.
- **Status:** in_progress

### Phase 2: Design and implementation plan
- [ ] Select the smallest existing seam for configurable derivation.
- [ ] Define regeneration and manual-override behavior from actual schema.
- **Status:** pending

### Phase 3: Implement
- [ ] Add rules, derivation, generation integration, and reachable UI.
- [ ] Regenerate owned output where required.
- **Status:** pending

### Phase 4: Verify
- [ ] Run focused existing tests and required repository checks.
- [ ] Create, run, and remove a temporary Playwright verification test.
- **Status:** pending

### Phase 5: Review and handoff
- [ ] Inspect diff and document verified results.
- **Status:** pending

## Key Questions
1. Which current entities own pack-list items, menu dishes, headcount, and service style?
2. Does a configurable smallwares/rule model already exist?
3. How does pack-list regeneration currently preserve manual rows or overrides?

## Decisions Made
| Decision | Rationale |
|---|---|
| Discover before choosing a data model | The supplied brief was explicitly ungrounded; existing Manifest contracts must be reused. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| None | — | — |

---

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
