import { describe, expect, it } from "vitest";
import {
  deriveDishAllergens,
  dishAllergenClaim,
} from "../../../src/features/kitchen/dishAllergens";
import { deriveAllergenRows } from "../../../src/features/kitchen/AllergenMatrixPage";
import { menuDishTextSources } from "../../../src/features/events/EventMenuDietaryConflictsCard";
import { crossCheckMenu } from "../../../src/features/events/eventDietaryCrossCheck";

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

  it("the event menu's guest-allergy check reads recipe marks and ingredient allergens", () => {
    const sources = menuDishTextSources({
      eventId: "e",
      event: null,
      guests: [],
      selections: [{ _id: "line", dishId: "pasta" }],
      dishes: [{ _id: "pasta", name: "Pasta" }],
      dishIngredients: [],
      dishComponents: [{ dishId: "pasta", componentId: "sauce" }],
      componentIngredients: [{ componentId: "sauce", ingredientId: "parm" }],
      ingredients: [{ _id: "parm", name: "Parmesan", allergens: ["milk"] }],
      components: [
        { _id: "sauce", name: "Pomodoro Sauce", declaredAllergens: ["wheat"] },
      ],
    });
    const conflicts = crossCheckMenu(
      [
        {
          term: "gluten",
          family: "gluten",
          origin: { kind: "guest", guestName: "Ann" },
        },
        {
          term: "dairy",
          family: "dairy",
          origin: { kind: "guest", guestName: "Bo" },
        },
      ],
      sources,
    );
    expect(conflicts.map((row) => row.evidence)).toEqual([
      "Pomodoro Sauce ingredient: “parmesan”",
      "Pomodoro Sauce marked on recipe: “wheat”",
    ]);
  });

  it("without the recipe list nothing changes for older callers", () => {
    const { components: _ignored, ...older } = input;
    expect(deriveDishAllergens({ _id: "pasta" }, older).codes).toEqual([]);
  });
});
