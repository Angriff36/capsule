# Task Plan: Culinary planning slice

> Archived after implementation and verification handoff on 2026-07-16.

## Goal

Replace the `/kitchen` placeholder with a verified Manifest-backed culinary planning workflow for ingredients, recipes, dishes, menus, and event-dish selection without entering Production, Inventory, or generated-file work.

## Current Phase

Phase 1

## Phases

### Phase 1: Contract and product discovery

- [x] Trace canonical culinary Manifest commands, guards, roles, lifecycle metadata, generated hooks, and data shapes.
- [x] Read the current design archetype and confirm the narrow operator outcome and route family.
- [x] Record explicit projection/product limitations rather than inventing missing domain behavior.
- **Status:** completed

### Phase 2: Focused proof first

- [x] Add focused failing tests for route wiring, generated-hook consumption, lifecycle offers, creation delegation, and event-dish handoff.
- [x] Confirm failures precede implementation.
- **Status:** completed

### Phase 3: Authored Kitchen implementation

- [x] Implement the culinary-book routes and authored UI using generated hooks and metadata.
- [x] Add only the smallest approved creation seam required by generated command shapes.
- [x] Preserve loading, empty, unavailable, failure, conflict, and busy states.
- **Status:** completed

### Phase 4: Documentation and visual verification

- [x] Update the Culinary system page and navigation status with real shipped behavior and limitations.
- [ ] Verify desktop/mobile behavior against the existing industrial editorial design system.
- **Status:** blocked for visual inspection because no in-app browser is attached; static responsive review and production build passed

### Phase 5: Repository verification

- [x] Run focused tests, frozen install, outdated, audit, and `bun run check`.
- [x] Separate task failures from pre-existing dirty-worktree failures without modifying unrelated work.
- **Status:** blocked only at unrelated baseline decay root-entry cap; focused proof, both guards, typecheck, formatting, install, audit, coverage, secrets, and build passed

## Key Questions

1. Which generated commands can create each culinary entity, and do they require preallocated IDs?
2. What Menu-to-Dish relationship actually exists in the source and generated model?
3. What minimum route family completes a thin culinary planning outcome without claiming Production readiness?

## Decisions Made

| Decision                                                                                      | Rationale                                                                                                  |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Treat this as Slice 2 Culinary planning, not Production/PrepTask                              | The current implementation sequence and Culinary owner page supersede the older Capsule-V2 handoff memory. |
| Preserve the existing industrial/editorial shell and express Kitchen as a dense culinary book | This matches `DESIGN.md`, the existing app primitives, and the Culinary owner page.                        |
| Use peer catalog routes plus a Recipe working document                                        | This is the smallest route family that covers the catalog owner and one detailed operational document.     |
| Treat EventDish as the cross-system handoff; do not invent Menu-Dish composition              | EventDish is the only source-modeled composition relation.                                                 |

## Errors Encountered

| Error                                                                                                    | Attempt | Resolution                                                                    |
| -------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Combined template/existence inspection exited 1 because `codex-plans` and its ignore entry did not exist | 1       | Read templates separately and created the required planning files explicitly. |
| Generic culinary mutation export search returned no matches                                              | 1       | Switch to exact entity-qualified generated symbol names.                      |
| Searched a guessed generated bindings filename that does not exist                                       | 1       | Use `src/generated/manifest-wiring-bindings.ts`, confirmed by `rg --files`.   |
| Combined CSS/icon inspection exited 1 after CSS succeeded                                                | 1       | Reuse text affordances and known primitives; no new icon lookup is required.  |
| Hidden Vite launch through `Start-Process bun` failed                                                    | 1       | Resolve Bun's executable source and launch that path directly.                |

## Notes

- Do not modify generated files, optimize Event guest querying, fix projection backlog, or expand into Production/Inventory.
- Preserve all pre-existing modified and untracked work.
