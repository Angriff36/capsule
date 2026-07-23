# Findings & Decisions: Recipe cost calculator

## Requirements
- Compute ingredient cost in real time by joining each RecipeLine quantity to current vendor pricing per unit.
- Show total batch cost and cost per portion alongside the recipe editor.
- Follow existing authored/generated ownership and UI conventions.
- Preserve the broadly dirty checkout and unrelated feature work.
- Create, run, and delete a temporary Playwright verification test.
- Run the required repository gate before claiming completion.

## Research Findings
- Checkout is `main` at `b080022` with extensive pre-existing modified and untracked work.
- Relevant pre-existing changes include `RecipeDetailPage.tsx`, `ingredient.manifest`, shared styles, generated files, and a `preferred-vendor-mapping` plan; none may be overwritten casually.
- `npx` is available as required by the Playwright skill; repository-local execution will use Bun conventions.
- No directly relevant prior-memory entry was found for this exact recipe-cost feature.
- The completed preferred-vendor feature added ordered vendor IDs plus a scalar primary vendor on `Ingredient`, but it did not add vendor-specific price rows.
- Live `Ingredient` already has required `costPerUnit: money(12, 2)` and a `unit`; this may be the current unit price the feature description refers to, but recipe quantity/unit semantics still need confirmation.
- `RecipeDetailPage.tsx` has no current diff against HEAD, while the manifest and shared stylesheet diffs belong to other features; the editor can likely be extended safely if no recent write activity appears.
- `RecipeIngredient` is the live equivalent of the feature brief's RecipeLine: it stores `ingredientId`, positive decimal `quantity`, and a `UnitOfMeasure` independent from the Ingredient's pricing unit.
- `Ingredient.updateCosting` updates `costPerUnit` and emits its unit; this is the live current-pricing record. `Vendor` contains supplier identity/contact/terms only and has no catalog-price or quote entity.
- No shared conversion utility exists. The unit vocabulary contains three convertible dimensions: mass, volume, and count-like (`each`, `portion` only when identical). Cross-dimension or different count-like units cannot be priced honestly without ingredient-specific density/yield data.
- The editor already loads all ingredients and recipe lines, so the calculator can remain an authored, reactive projection with no Manifest or generated-file change.
- The AboardAI feature record confirms moderate complexity, no dependencies, and requires actual implementation plus verification; it adds no hidden pricing-model acceptance criteria.
- Existing purchasing demand uses `(recipe line quantity * batchMultiplier * servings) / yieldQuantity`, proving that one displayed recipe batch consumes line quantity × recipe batch multiplier and that per-yield-unit cost divides by yield quantity.
- The repo has no Playwright config or dependency; prior feature verification successfully used a disposable Vite harness/spec through a temporary `playwright` package and deleted it afterward.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Defer calculation shape until the live quantity and pricing semantics are traced | Prevent unit mismatches and invented joins |
| Reuse existing design language instead of introducing a new page aesthetic | The calculator is an operational readout inside an established recipe editor |
| Compute from current Ingredient reads instead of adding a stored Recipe cost | Live reads update instantly when a line or ingredient cost changes and avoid stale derived data |
| Treat incompatible units and zero-price ingredients as incomplete rather than silently `$0` | Prevents a deceptively low batch cost |
| Use standard mass and US-volume conversion factors; require equality for `each`/`portion` | Cross-dimensional conversions need density or package-yield data that the live model does not store |
| Present a priced subtotal plus coverage when incomplete | Chefs still get useful known cost without a false total |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Existing root planning files belong to payroll export | Created an isolated feature planning directory |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `codex-plans/preferred-vendor-mapping/`
- `src/features/kitchen/RecipeDetailPage.tsx`
- `src/culinary/ingredient.manifest`

## Visual/Browser Findings
- Chromium rendered the real `RecipeCostPanel` inside a disposable Vite harness.
- With 500 g flour priced at $2/kg, two cups cream initially unpriced, batch ×2, and yield 8 portions, the panel showed a $2.00 priced subtotal, $0.25 known cost/portion, 1/2 coverage, and the pricing-attention message.
- Loading cream's $4/liter price immediately changed the panel to a complete $5.79 batch total and $0.72/portion at 2/2 coverage.
- Editing the batch multiplier from 2 to 3 immediately changed the total to $8.68 and cost/portion to $1.08.
