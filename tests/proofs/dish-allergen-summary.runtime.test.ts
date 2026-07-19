/**
 * Focused proof: Dish.allergenSummary unions allergens through
 * Dish → Recipe → RecipeIngredient → Ingredient (unique_of ∘ flat_map).
 */
import { describe, expect, it } from "vitest";
import { computeDish } from "../../convex/computed";

describe("Dish.allergenSummary multi-hop", () => {
  it("returns deduplicated allergens across nested recipe ingredient lines", () => {
    const doc = {
      status: "active",
      recipeLines: [
        {
          recipe: {
            ingredientLines: [
              { ingredient: { allergens: ["milk", "eggs"] } },
              { ingredient: { allergens: ["eggs", "wheat"] } },
            ],
          },
        },
        {
          recipe: {
            ingredientLines: [{ ingredient: { allergens: ["milk"] } }],
          },
        },
      ],
    };

    expect(computeDish(doc).allergenSummary).toEqual(["milk", "eggs", "wheat"]);
  });

  it("returns [] when the dish has no recipe lines or empty nested collections", () => {
    expect(
      computeDish({ status: "active", recipeLines: [] }).allergenSummary,
    ).toEqual([]);
    expect(
      computeDish({
        status: "active",
        recipeLines: [{ recipe: { ingredientLines: [] } }],
      }).allergenSummary,
    ).toEqual([]);
  });
});
