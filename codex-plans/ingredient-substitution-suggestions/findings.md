# Findings: Ingredient substitution suggestions

## Requirements
- Suggest configured substitute ingredients when a recipe ingredient is out of stock or below demand.
- Rank suggestions by allergen compatibility and cost delta.
- Let kitchen users adapt without recreating the recipe.
- Explore and plan before implementation.
- Verify the core flow with a temporary Playwright spec, then delete the spec.
- Run the repository-required `bun run check` gate before claiming completion.

## Repository constraints
- Author UI under `src/app/**`, `src/features/**`, and `src/ui/**`.
- Author domain changes in `src/**/*.manifest`; regenerate only with `bun run manifest:regen`.
- Do not hand-edit generated Convex, Manifest client, schema, wiring, diagram, seed, or generated contract-test paths.
- Do not add permanent tests unless asked; this task authorizes only a temporary Playwright verification spec.
- Preserve the extensive pre-existing dirty worktree and stop if target files are actively rewritten.

## Research Findings
- `src/culinary/ingredient.manifest` already models `Ingredient.allergens` and `Ingredient.costPerUnit`, so compatibility and price ranking inputs exist on the ingredient itself.
- `src/culinary/ingredient.manifest` links ingredients to `RecipeIngredient` and `InventoryItem`; no substitute mapping was found by the initial source search.
- `src/inventory/demand.manifest` models ingredient demand, while `src/features/kitchen/EventMenuPage.tsx` already loads recipe lines, demand, and inventory and surfaces stock reservation shortages.
- `src/features/kitchen/AllergenMatrixPage.tsx` derives allergen exposure from recipe ingredient data, providing an existing interpretation of the allergen vocabulary.
- The worktree has multiple active automation/dev processes. Candidate kitchen files were last changed around 08:25-08:28, while the current session began later; overlap still needs a diff/hash check before editing.
- The feature board marks this as a moderate Culinary feature with `inventory-par-levels` as its prerequisite; that stock/demand foundation already exists.
- `IngredientDetailPage.tsx` has concurrent but stable preferred-vendor and price-history additions. Its ordered preference editor provides a direct UI pattern for substitute configuration.
- `RecipeDetailPage.tsx` has stable recipe-cost and draft-restoration additions. It can remain unchanged if suggestions are attached to the existing event shortage surface.
- `RecipeIngredient` can adjust quantity/remove lines but has no safe event-specific replacement command. Replacing a shared recipe line would affect every use of that recipe, so it is not the right default response to one event shortage.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Persist ordered `substituteIngredientIds` on `Ingredient` | Mirrors existing ordered vendor preferences, keeps configuration per ingredient, and avoids a needless join entity for metadata the task does not request. |
| Present suggestions in the existing event-menu shortage banner | That surface is already triggered when reserved stock is below recipe-driven demand and is where kitchen staff need alternatives. |
| Do not mutate the shared recipe automatically | An event shortage should not silently change the canonical recipe for every future event. Suggestions let staff adapt while preserving the source recipe. |
| Rank allergen safety before signed cost delta | A cheaper alternative that introduces a new allergen should not outrank a compatible option. Lower unit cost breaks ties among equally compatible substitutes. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Initial broad source search output was truncated | Narrow subsequent reads to exact files and symbols. |
| `playwright.config.ts` does not exist | Use a self-contained temporary spec against the documented running URL without changing project dependencies. |
| Two planning-update patches missed exact context | Split the updates by file after re-reading current content. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`
- `docs/architecture/domain-gating-restraint.md` if Manifest policies change

## Visual and Browser Findings
- The existing Vite app responds at `http://localhost:7811` as documented.
- No repository `playwright.config.ts` or permanent Playwright specs exist, although `@playwright/test` processes/artifacts from other feature verifications are present.
- The temporary verification must be self-contained and deleted after the run.
- Recent browser snapshots stall at Clerk's “Checking your session…” state, so an authenticated mutation flow would not be reliable evidence in this environment.
- `@playwright/test` 1.61.1 and Chromium are already present locally; no dependency install is needed.
- Verification will use a temporary Vite entry that renders the real `EventMenuStockShortageBanner` with representative mapped ingredients, stock, and reservations. This exercises browser rendering plus the production ranking utility without bypassing app auth in product code.
- Chromium rendered the production banner cleanly at desktop width: the shortage summary is prominent, ranked alternatives scan vertically, green allergen-compatible chips and amber “Adds milk” warning are distinct, and cost/coverage labels remain legible.
- The temporary Playwright spec passed all assertions and the temporary spec plus Vite harness were deleted immediately afterward.
