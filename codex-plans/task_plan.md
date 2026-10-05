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
