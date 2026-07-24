# Culinary

> Owns the CapsuleX operator experience for Ingredient, Recipe, RecipeStep, RecipeIngredient, Dish, DishRecipe, Menu, MenuDish, EventDish, and governed recipe import.

## Purpose

Maintain the house culinary book and compose event service from governed ingredients, recipes, dishes, menus, portions, pricing, allergens, and instructions.

## Owned domain

| Source                            | Entities                             |
| --------------------------------- | ------------------------------------ |
| `culinary/ingredient.manifest`    | Ingredient                           |
| `culinary/recipe.manifest`        | Recipe, RecipeStep, RecipeIngredient |
| `culinary/recipe-import.manifest` | RecipeImport, RecipeImportLine       |
| `culinary/dish.manifest`          | Dish, DishRecipe                     |
| `culinary/menu.manifest`          | Menu                                 |
| `culinary/menu-dish.manifest`     | MenuDish                             |
| `culinary/event-dish.manifest`    | EventDish                            |

## Domain hierarchy (binding)

```text
Event
  └── EventDish              # dish on this event + servings
        └── PrepTask[]       # work lines (owned by EventDish, not Event)
              └── Recipe?    # optional MAKE link (e.g. caesar dressing)
                    ├── RecipeStep[]
                    └── RecipeIngredient[] → Ingredient

Dish                         # finished product (NOT a recipe)
  └── DishRecipe[] → Recipe  # N recipes compose one dish

Menu
  └── MenuDish[] → Dish      # required menu composition
```

## Primary workspace

Use a **culinary book** rather than a dashboard:

- sibling indexes for Recipes, Dishes, Ingredients, and Menus;
- full-width detail documents with identity, lifecycle, quantities, costing, allergens, and linked usage;
- an event menu composer that makes EventDish course, servings, service style, and instructions explicit;
- a recipe import split workbench (`/kitchen/recipes/import`) that parses pasted text, `.txt` files, and paired CSV exports client-side, reviews matched/new ingredients, and finalizes through generated commands plus durable `RecipeImport` provenance when persisted.

## Core workflows

- Introduce and maintain Ingredient identity, unit, allergen classification, and cost; discontinue/reinstate for lifecycle; **Delete** (`Ingredient.purge`) soft-hides a row from the live catalog (not a hard DB wipe).
- Price Recipes from the newest confirmed `IngredientPriceObservation` created by a vendor-line receipt, falling back to the Ingredient catalog cost until a receipt exists.
- Draft/revise/publish/retract/retire Recipe versions; manage RecipeStep method lines and RecipeIngredient BOM lines.
- Introduce/revise/portion/classify/retire/reinstate Dishes; attach/detach Recipes via DishRecipe.
- Draft/revise/price/publish/unpublish/archive/restore Menus; add/update/remove MenuDish lines.
- Select a Dish for an Event (EventDish) and adjust servings, course, service style, and instructions.
- Open PrepTasks under an EventDish (optional Recipe link for MAKE lines).
- Upload/import recipes with durable `RecipeImport` lifecycle and per-line resolution.

## Cross-system handoffs

EventDish (and its PrepTasks) plus Recipe/Ingredient relationships drive demand, production batches, pack items, allergen checks, and costs. Culinary UI must show those downstream uses but route operational edits to Inventory, Production, Logistics, or Quality.

## States and permissions

Kitchen access governs normal work; costing and lifecycle commands may require higher capability. The UI must not invent procedures, prep time, nutrition, or media when the model does not supply them. Search declarations currently lack generated full-text support (import matching is client-side catalog scan).

### Recipe import ownership (binding)

| Concern                                                                    | Owner                  | Location                                                                |
| -------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| What a valid Recipe / Ingredient / RecipeIngredient / RecipeImport is      | Manifest               | `src/culinary/*.manifest` → generated Convex commands                   |
| Paste/upload, deterministic parse, match confidence UI, review corrections | Capsule                | `src/features/kitchen/import/**`                                        |
| Persist after review                                                       | Manifest commands only | `useCreateIngredient` / `useCreateRecipe` / `useCreateRecipeIngredient` |
| Durable import checkpoints and line resolution                             | Manifest               | `RecipeImport` / `RecipeImportLine` commands                            |

Do **not** add Manifest commands like `parseRecipeText` / `matchIngredientNames` / `extractNutrition` — parsing and matching stay authored TypeScript. OCR, URL scraping, and AI parsing remain out of scope.

## Current status

All culinary entities have generated list/detail/index queries and command hooks. The authored `/kitchen` route family now provides:

- live Recipe, Ingredient, Dish, and Menu indexes with command-backed creation;
- detail routes for Recipe, Ingredient, Dish, and Menu;
- ordered preferred-vendor management on Ingredient detail, with the first vendor feeding automatic weekly purchasing and the tenant vendor as fallback;
- a vendor-filterable confirmed purchase-price ledger on Ingredient detail, plus newest-receipt pricing in the live Recipe cost panel;
- a compact Recipe working document for draft revision, lifecycle commands, ingredient lines, method, and Dish usage;
- generated-metadata lifecycle offers for Recipe, Ingredient, Dish, and Menu;
- an Event menu composer that selects, adjusts, and removes EventDish records;
- a recipe import workbench at `/kitchen/recipes/import` (paste/files → parse → review → finalize).

Creation uses governed hooks generated by Manifest (`useCreateIngredient`, `useCreateRecipe`, `useCreateRecipeIngredient`, `useCreateDish`, `useCreateMenu`, and `useCreateEventDish`). Import provenance uses `useCreateRecipeImport`, `useCreateRecipeImportLine`, and the generated RecipeImport lifecycle hooks.

**Import proof:** `tests/proofs/recipe-import-finalize.runtime.test.ts` plus parser/fixture coverage in `tests/recipe-text-parser.test.ts`. Proof-kit marks `Recipe.draft`, `Ingredient.introduce`, and `RecipeIngredient.add` as `runtime_proven` via that runtime test.

EventDish composition stays manager-editable through **executing** (86, swap, zero servings, notes). Cancelled/completed menu adds stay locked; post-event servings corrections allowed. See `docs/architecture/domain-gating-restraint.md`.

Generated EventDish runtime behavior, MenuDish/DishRecipe UI, and PrepTask-under-EventDish reactions still require focused runtime proof beyond structural wiring tests. Dish/Menu bulk import beyond recipe import is deferred.

## References

- Canonical: `C:/projects/Manifest-source/src/culinary`
- Design: `DESIGN.md` → Recipe Book and culinary detail patterns
- Import design: `docs/superpowers/specs/2026-07-17-culinary-recipe-import-design.md`
- Read-only intent reference: Capsule-Pro Kitchen recipes/dishes/ingredients/menus
- Ops evidence: `Downloads/work` dishes/prep_list/recipe CSVs (Dish ≠ Recipe; prep under event dishes)
