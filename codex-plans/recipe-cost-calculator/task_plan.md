# Task Plan: Recipe cost calculator

## Goal
Show a recipe's live total batch cost and cost per portion beside the editor by joining recipe-line quantities to current vendor unit pricing.

## Current Phase
Complete

## Phases

### Phase 1: Requirements and discovery
- [x] Capture user requirements and repository constraints
- [x] Trace recipe lines, ingredient pricing, editor hooks, and existing partial work
- [x] Confirm the dirty checkout can be safely extended
- **Status:** complete

### Phase 2: Plan the authored implementation
- [x] Define the calculation rules and missing-price behavior from live model semantics
- [x] Identify the smallest authored files and browser verification path
- **Status:** complete

### Phase 3: Implement
- [x] Add the calculator without editing generated or assembly-owned files
- [x] Preserve all unrelated user/session changes
- **Status:** complete

### Phase 4: Verify
- [x] Run focused static verification
- [x] Create, run, and delete a temporary Playwright spec
- [x] Run `bun run check` (blocked by unrelated Event direct-hook violations already tracked in issue #40)
- **Status:** complete with unrelated repository blocker

### Phase 5: Delivery
- [x] Inspect the exact diff and status
- [x] Keep the plan unarchived because the required full gate is blocked outside this feature
- [x] Provide the exact tagged summary requested by the user
- **Status:** complete

## Key Questions
1. Which durable field represents current vendor price per unit, and what unit is it priced in?
2. How are recipe-line quantities and recipe portions represented in the current checkout?
3. Does the recipe editor already have all required read hooks, or is a Manifest source change and regeneration required?
4. How should incomplete pricing be shown without implying a falsely complete cost?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Isolate this feature under `codex-plans/recipe-cost-calculator/` | The root plan belongs to an existing payroll task and must not be overwritten |
| Treat all pre-existing dirty files as user-owned | The checkout was broadly dirty before this feature began |
| Read `Ingredient.costPerUnit` as current vendor/catalog pricing | The live Vendor model has no quote/price rows; Ingredient owns the mutable current cost and unit |
| Convert within mass or volume dimensions using standard US culinary factors | Recipe line and price units may differ; exact/unit-compatible math is possible without ingredient density |
| Mark zero/missing price and incompatible unit pairs incomplete | A partial subtotal must not be presented as a complete recipe cost |
| Multiply line costs by `batchMultiplier`, then divide the batch total by `yieldQuantity` | The existing demand reaction uses the same line × multiplier ÷ yield semantics |
| Add a pure calculator plus a focused presentational panel and wire both into Recipe detail | Keeps business math testable and UI verification possible without generated changes |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Initial parallel metadata command returned only a generic nonzero script result because one search had no matches | 1 | Re-ran each operation with explicit error handling; memory search correctly had no relevant hits |
| Cost panel initially referenced undefined theme token `--color-paper` | 1 | Replaced it with the existing `--color-panel` token before browser verification |
| Starting Vite through the PowerShell `bun.ps1` shim opened a Notepad process instead of Bun | 1 | Stopped the exact process and launched the shim's concrete `bun.exe` target |
| Recursive Playwright artifact cleanup command was blocked by tool policy | 1 | Deleted the only result file with `apply_patch`; the temporary spec/harness were already deleted and the empty ignored folder is harmless |
| `bun run check` stopped at `check:event-manifest` on concurrent Event direct-hook violations | 1 | Preserve unrelated Event work; issue #40 already tracks the blocker and focused calculator/culinary gates continue |
