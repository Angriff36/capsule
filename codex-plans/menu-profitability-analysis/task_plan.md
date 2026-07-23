# Task Plan: Menu Profitability Analysis

## Goal
Combine recipe cost and MenuDish selling price to show per-dish gross margin, rank dishes within a menu, and flag low-margin items for operator action.

## Current Phase
Phase 4

## Phases

### Phase 1: Requirements and discovery
- [ ] Trace current Menu, MenuDish, Dish, Recipe, pricing, and cost-calculation data
- [ ] Identify authored UI seams and any active concurrent edits
- [ ] Record findings and constraints
- **Status:** complete

### Phase 2: Plan
- [ ] Define calculations, low-margin threshold, ranking, and empty states from existing conventions
- [ ] Select the smallest authored-file change set
- **Status:** complete

### Phase 3: Implementation
- [x] Implement pure profitability calculation/presentation logic
- [x] Integrate the analysis into the existing menu experience
- [x] Preserve unrelated work and generated boundaries
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing checks
- [x] Create, run, and delete a temporary Playwright test for the core flow
- [ ] Run `bun run check`
- **Status:** in_progress

### Phase 5: Delivery
- [ ] Inspect final diff and confirm temporary files are removed
- [ ] Archive the completed plan under docs/task-plans
- [ ] Provide the required tagged summary
- **Status:** pending

## Key Questions
1. Where does the current UI obtain MenuDish price and recipe cost data?
2. What existing monetary units and formatting conventions must the calculation use?
3. What threshold or signal for low margin already exists in product behavior?
4. Can the feature be added without touching generated files or conflicting with active work?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use authored seams only | Repository ownership rules prohibit hand-editing generated output. |
| Do not add permanent tests | AGENTS.md forbids adding or expanding tests unless the owner asks; the requested Playwright spec will be temporary and removed. |
| Store `sellingPrice` as optional `money(12, 2)` on MenuDish | Optional storage keeps existing Convex rows valid while making the canonical link own its dish-specific price. |
| Add a dedicated `updateSellingPrice` command | This permits published-menu repricing with a proportionate manager gate without tightening the general details command. |
| Accept selling price during `MenuDish.add` | A newly added dish can be priced in one operation instead of forcing a second tedious command. |
| Flag gross margin below 70% | Capsule's existing food-cost reporting defaults to a 30% target; gross margin is its complement. |
| Calculate dish cost from DishRecipe snapshots | Each attachment records its yield and batch multiplier, allowing per-serving cost to be summed across every recipe component. |
| Rank only rows with complete costs and a positive selling price | Incomplete data cannot produce a trustworthy comparable margin; those rows stay visible below ranked dishes with clear actions. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Combined discovery command exited 1 because PowerShell expanded a missing `playwright.config.*` path | 1 | Useful output was complete; future searches will target `package.json` or guard optional paths explicitly. |
| `rg src/**/*.manifest` is not a valid recursive glob on Windows PowerShell | 1 | Use `rg ... src --glob '*.manifest'` for future Manifest searches. |
| Parallel memory/template lookup returned exit 1 when the memory search had no matches | 1 | Split the lookups and handle ripgrep's no-match status explicitly. |
| Feature patch could not apply because `MenuProfitabilityAnalysis.ts` changed after inspection | 1 | Stopped feature edits immediately and switched to a read-only concurrency check. |
| Local Vite URL `127.0.0.1:7811` refused the Playwright preflight connection | 1 | Keep the dev server untouched and use a temporary Bun-bundled browser harness for Playwright. |
| `npx @playwright/test@latest` conflicted with the repository's local Playwright version and discovered no tests | 1 | Use the existing local runner and matching package version instead of mixing installations. |
| Local Playwright launched but the temporary harness rendered no panel | 2 | Inspect the captured page error and add the missing runtime provider rather than rerunning unchanged. |
| Validated PowerShell cleanup command was blocked by the tool policy | 1 | Delete each exact generated artifact with `apply_patch`; leave only harmless empty directories if needed. |
| `bun run check` stopped at unrelated Event Manifest integration violations | 1 | Preserved concurrent Event work, confirmed the culinary guard passes, and linked existing GitHub issue #58. |
| `bun run format:check` found the feature CSS plus unrelated inventory/ledger formatting failures | 1 | Format only `MenuProfitabilityPanel.css`, verify the feature file set, and preserve other sessions' files. |
| `bun run test:coverage` failed on unrelated creation-map, Event/Supply guard, navigation, and Invoice finance-read regressions | 1 | Preserve unrelated work, confirm culinary/contract suites passed, and link or file distinct blocker issues. |

## Notes
- Existing dirty and untracked files belong to the user or other sessions and must be preserved.
- Stop if relevant files are actively being rewritten.
