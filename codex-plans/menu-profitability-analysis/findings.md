# Findings: Menu Profitability Analysis

## Requirements
- Combine recipe cost with the selling price stored on a menu-dish link.
- Compute gross margin per dish.
- Rank dishes by margin within a menu.
- Flag low-margin items so operators can reprice or substitute ingredients.
- Follow current Capsule authored/generated ownership boundaries.
- Verify the core feature with a temporary Playwright test and delete it afterward.

## Research Findings
- The initial worktree is heavily dirty and contains existing changes in kitchen UI and recipe-cost files; all are treated as unrelated until proven otherwise.
- `npx` is available, satisfying the Playwright skill prerequisite. Repository commands will still follow Capsule's Bun conventions.
- Older memory (2026-07-19) said the Menu-to-Dish association did not yet exist, but the live 2026-07-22 checkout now contains authored `src/culinary/menu-dish.manifest`; the current checkout is authoritative.
- Current culinary docs and source model `MenuDish` as the durable Menu-to-Dish composition entity, including update/remove commands.
- `MenuDetailPage.tsx` already lists `MenuDish` records and resolves their related `Dish` records, making it the natural authored UI seam.
- Recipe-cost support is already present as untracked authored files (`RecipeCostCalculator.ts` and `RecipeCostPanel.tsx`) and is integrated into a modified `RecipeDetailPage.tsx`; this work must be reused without overwriting its ownership.
- An active Playwright worker and several Convex processes exist for this checkout. No coding-agent process was visible, but relevant file stability still needs verification before edits.
- Two hash snapshots of the relevant files remained identical during discovery; the files are currently stable enough for a narrow edit.
- `MenuDish` currently has no selling-price property, despite the feature requiring the price on that link. The authored Manifest source must gain this data before generated bindings can expose it.
- A dish can contain multiple `DishRecipe` rows. Each attachment snapshots recipe yield quantity and batch multiplier; recipe ingredient lines and current ingredient/receipt prices are sufficient to calculate each attached recipe cost.
- The existing recipe calculator uses the latest receipt price when available, falls back to catalog cost, handles unit conversion, and marks incomplete pricing. Menu profitability should reuse the same rules.
- Required list hooks already exist for Dish, DishRecipe, Ingredient, IngredientPriceObservation, MenuDish, Recipe, and RecipeIngredient.
- Domain gating guidance explicitly says money changes may use a real manage capability while ordinary operational composition should remain usable. A dedicated price-update command avoids tightening the existing MenuDish details command.
- Menu pricing uses `money(12, 2)`, nonnegative constraints, and `kitchenManageAccess` for later price changes. MenuDish selling price should follow those established conventions.
- Current generated bindings already expose create, update-details, and remove hooks for MenuDish; regeneration after a source command addition should produce the dedicated reprice hook.
- The current Menu detail UI does not render its MenuDish rows at all, so this feature should add an operator-facing analysis section rather than just a hidden calculation.
- The in-progress feature already has authored `MenuProfitabilityAnalysis.ts` and `MenuProfitabilityPanel.tsx`, but the panel is not wired into `MenuDetailPage.tsx` and its imported CSS file does not yet exist.
- Generated Convex and React bindings already include `MenuDish.sellingPrice` and `useMenuDishUpdateSellingPrice`, so another process has completed the approved regeneration after the Manifest edit; no additional regeneration is needed unless the Manifest source changes again.
- Relevant feature files stayed byte-identical across a two-second hash check. Multiple other coding sessions are active in the broadly dirty checkout, so all edits must remain narrowly scoped and avoid generated/regenerated output.
- Existing hooks provide every live input needed by the calculator: dishes, dish-recipe attachments, recipe ingredients, ingredients, receipt price observations, menu dishes, and the MenuDish reprice mutation.
- The established frontend uses an editorial/ledger-style profitability treatment with Archivo and IBM Plex Mono, muted paper tones, compact metric grids, responsive fallbacks, and reduced-motion support; the new menu board should stay visually related while remaining its own isolated stylesheet.
- An overlapping session completed the intended menu-page wiring, price-save failure handling, and isolated stylesheet during this turn. The relevant five files then remained byte-identical across a five-second check, so work can continue in read-only verification mode without racing its edits.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Optional MenuDish selling price | Avoids invalidating existing durable rows during Convex schema rollout. |
| 70% default gross-margin target | Matches the complement of the existing 30% food-cost target. |
| Dedicated pure analysis module | Keeps calculations deterministic and independently usable by the UI and temporary verification harness. |
| Dedicated panel and CSS files | Avoids colliding with the large unrelated `app.css` delta and gives the feature an intentional compact ledger design. |
| Cost each DishRecipe as batch ingredient cost divided by its snapshot yield | The link explicitly snapshots yield and batch multiplier for downstream quantity calculations. |
| Treat no recipe, no lines, missing prices, or incompatible units as incomplete | Avoids presenting misleading zero-cost/high-margin results. |
| Rank only positive selling prices | Percentage margin is undefined at zero revenue, so zero-priced and missing-price rows remain visible but unranked. |
| Keep the price editor open after a failed mutation | Operators should see the existing failure banner and be able to correct or retry without re-entering the edit flow. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Historical memory no longer matches the current source shape | Re-verified live files and will design against the current `MenuDish` source. |
| A combined search returned exit 1 because an optional `playwright.config.*` glob did not exist | Retained its valid output and will use guarded/explicit paths in later commands. |
| A recursive `src/**/*.manifest` glob produced a Windows path error | Use `rg` against `src` with `--glob '*.manifest'`. |

## Resources
- `AGENTS.md`
- `.aboardai/context/*.md`

## Visual/Browser Findings
- The temporary browser harness rendered three menu rows in the expected order: 80% margin first, 60% margin second with a low-margin flag, and the missing-price row last/unranked.
- The initial portfolio margin displayed as 73.3% with one dish needing attention. Repricing the low-margin dish from $10 to $15 updated that row to `On target`, changed the portfolio margin to 77.1%, and reduced the low-margin count to zero.
- The first harness render needed a `MemoryRouter` because the real panel contains dish links. After adding that provider, the Playwright test passed in Chromium.
