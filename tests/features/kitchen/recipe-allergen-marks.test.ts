import { describe, expect, it } from "vitest";
import {
  deriveDishAllergens,
  dishAllergenClaim,
} from "../../../src/features/kitchen/dishAllergens";
import { deriveAllergenRows } from "../../../src/features/kitchen/AllergenMatrixPage";

const input = {
  dishIngredients: [],
  dishComponents: [{ _id: "dc", dishId: "pasta", componentId: "sauce" }],
  componentIngredients: [
    {
      _id: "line",
      componentId: "sauce",
      ingredientId: "tomato",
      ingredient: { _id: "tomato", name: "Diced Tomato", allergens: [] },
    },
  ],
  ingredients: [],
  components: [
    { _id: "sauce", name: "Pomodoro Sauce", declaredAllergens: ["wheat"] },
    { _id: "other", name: "Other", declaredAllergens: ["fish"] },
  ],
};

describe("allergens marked on a recipe reach its dishes (PL-RECIPE-SHEET)", () => {
  it("a dish using a recipe marked wheat contains wheat, with the recipe named", () => {
    const report = deriveDishAllergens({ _id: "pasta" }, input);
    expect(report.codes).toEqual(["wheat"]);
    expect(report.sources.get("wheat")).toEqual([
      "Pomodoro Sauce (marked on recipe)",
    ]);
    expect(dishAllergenClaim(report)).toBe("contains");
  });

  it("the kitchen allergen chart shows the recipe mark", () => {
    const rows = deriveAllergenRows({
      dishIds: ["pasta"],
      dishes: [{ _id: "pasta", name: "Pasta" }],
      ...input,
    });
    expect([...rows[0]!.sources.keys()]).toEqual(["wheat"]);
  });

  it("without the recipe list nothing changes for older callers", () => {
    const { components: _ignored, ...older } = input;
    expect(deriveDishAllergens({ _id: "pasta" }, older).codes).toEqual([]);
  });
});
