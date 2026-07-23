# Ingredient substitution suggestions

## Outcome

Ingredients can store kitchen-configured substitute mappings. When event-menu
recipe demand cannot be fully reserved, the existing shortage banner ranks
mapped, same-unit alternatives that have unreserved stock. Candidates that add
no allergens rank before allergen-changing alternatives; signed catalog
unit-cost delta then orders equally compatible choices.

The canonical recipe is not silently rewritten for one event shortage. Kitchen
staff receive the alternative, coverage quantity, allergen impact, and cost
impact needed to adapt service.

## Authored implementation

- `src/culinary/ingredient.manifest`: `substituteIngredientIds` plus
  `Ingredient.configureSubstitutes`.
- `src/features/kitchen/IngredientSubstitution.ts`: availability and ranking.
- `src/features/kitchen/IngredientSubstitutionEditor.tsx`: per-ingredient
  mapping UI.
- `src/features/kitchen/IngredientDetailPage.tsx`: editor integration.
- `src/features/kitchen/EventMenuStockShortageBanner.tsx`: ranked shortage
  presentation.
- `src/features/kitchen/EventMenuPage.tsx`: ingredient, inventory, and
  reservation inputs.

Builder-owned outputs were refreshed only through `bun run manifest:regen`.

## Verification

- `bun run manifest:regen` — passed with zero conflicts/errors/blockers.
- `bun run typecheck` — passed.
- `bun run check:culinary-manifest` — passed.
- Scoped Prettier check — passed.
- `bun run secrets` — passed.
- `bun run build` — passed.
- Temporary Chromium Playwright spec — passed 1 test and was deleted with its
  temporary Vite harness. Screenshot evidence:
  `output/playwright/ingredient-substitution-suggestions.png`.

The full `bun run check` remains blocked by unrelated Event integration work in
issue #58. Independent coverage also encounters existing issues #32, #57, and
#58; baseline decay remains issue #47.
