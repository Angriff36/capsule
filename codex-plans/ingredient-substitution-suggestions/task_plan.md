# Task Plan: Ingredient substitution suggestions

## Goal
Implement mapped ingredient substitutes that appear when recipe demand exceeds stock, ranked by allergen compatibility and cost delta, with a verified kitchen user flow.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Inspect active checkout, authored domain/UI seams, and current overlapping work
- [x] Trace inventory shortage, recipe ingredient, cost, and allergen data end to end
- **Status:** complete

### Phase 2: Implementation plan
- [x] Define the smallest authored implementation following existing patterns
- [x] Identify exact files, generated boundaries, and acceptance criteria
- **Status:** complete

### Phase 3: Implementation
- [x] Add ordered substitute mapping/configuration behavior to Ingredient
- [x] Add shortage-aware ranking and kitchen presentation
- [x] Preserve unrelated user changes and avoid hand-editing generated paths
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create, run, and delete the required temporary Playwright spec
- [x] Run `bun run check` (stopped on tracked unrelated blockers)
- [x] Inspect final diff and worktree scope
- **Status:** complete

### Phase 5: Delivery
- [x] Archive completed plan
- [x] Provide the exact required `<summary>` handoff
- **Status:** complete

## Key Questions
1. Where are ingredient-to-ingredient mappings best authored without touching generated files?
2. Which current UI already exposes recipe demand versus stock and allergen data?
3. Can the required flow be exercised safely against the already-running app with disposable data?
4. Are any target files actively being changed by another session?

## Decisions Made
| Decision | Rationale |
|---|---|
| Use a feature-specific planning directory | The shared checkout already contains planning artifacts from concurrent feature work. |
| Treat generated Manifest/Convex/client files as read-only | Repository ownership rules require authored source changes plus `bun run manifest:regen` if generation is needed. |
| Configure ordered substitute IDs on Ingredient | It mirrors the existing preferred-vendor pattern and satisfies per-ingredient mapping without a metadata-free join entity. |
| Show ranked alternatives in the event-menu shortage banner | It is the existing point where recipe-driven demand is proven to exceed reservable stock. |
| Rank no-new-allergen candidates before cost | Allergen safety is the first operational compatibility concern; signed unit-cost delta then favors less expensive compatible choices. |
| Require matching units and positive available stock for suggestions | Capsule has no conversion ratios, so comparing costs or quantities across unlike units would be misleading. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Broad exploration output was truncated | 1 | Narrow reads to exact files and symbols. |
| Prettier cannot infer a parser for `.manifest` | 1 | Format only TS/TSX with Prettier; validate Manifest through `bun run manifest:regen`. |
| First CSS-class correction patch had an invalid hunk boundary | 1 | Reissued a valid multi-file patch; no product content was lost. |
| Repository has no `playwright.config.ts` | 1 | Use a self-contained temporary spec against the documented running URL, then delete it. |
| Two planning updates missed exact context | 2 | Split updates by file after re-reading current content. |
| `bun run check` stopped at unrelated Event integration violations | 1 | Confirmed existing GitHub issue #58 covers the exact seven violations; run remaining feature-relevant/later gates independently without editing concurrent Event work. |
| `bun run test:coverage` failed on shared baseline regressions | 1 | Confirmed issues #32, #57, and #58 cover the governed-creation/navigation/Invoice, PrepBoard, and Event failures; do not alter unrelated work. |
| `bun run baseline:decay` reports root entry count 57 over cap 44 | 1 | Existing tooling mismatch is tracked in issue #47; production build itself passed. |

## Notes
- Temporary Playwright coverage is explicitly authorized by the user and must be deleted after the run.
- Do not commit, push, deploy, or merge.
