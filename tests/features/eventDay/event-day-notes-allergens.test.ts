import { describe, expect, it } from "vitest";
import {
  displayEventMenuNotes,
  encodeEventMenuLineFields,
} from "../../../src/features/events/eventMenuLineFields";
import {
  deriveDishAllergens,
  dishAllergenClaim,
} from "../../../src/features/kitchen/dishAllergens";

const SENTINEL = '@capsule.menu {"containerCount":1}';

describe("Event Day leftover: strip @capsule.menu notes", () => {
  it("does not leak the sentinel into display or PDF text", () => {
    expect(displayEventMenuNotes(SENTINEL)).toBe("");
    expect(displayEventMenuNotes(SENTINEL)).not.toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(`${SENTINEL}\nKeep extra spicy`)).toBe(
      "Keep extra spicy",
    );
    expect(displayEventMenuNotes("Keep extra spicy\n" + SENTINEL)).toBe(
      "Keep extra spicy",
    );
    const encoded = encodeEventMenuLineFields({
      containerCount: 1,
      notes: "Half pan",
    });
    expect(encoded).toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(encoded)).toBe("Half pan");
    expect(displayEventMenuNotes(encoded)).not.toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(encoded)).not.toMatch(/containerCount/);
  });
});

function tortillasReport(allergens: unknown) {
  return deriveDishAllergens(
    { _id: "dish-tortillas", name: "Flour Tortillas For Tacos" },
    {
      dishIngredients: [
        {
          _id: "di-1",
          dishId: "dish-tortillas",
          ingredientId: "ing-flour",
        },
      ],
      dishComponents: [],
      componentIngredients: [],
      ingredients: [
        {
          _id: "ing-flour",
          name: "Flour Tortillas",
          allergens,
        },
      ],
    },
  );
}

describe("Event Day leftover: empty allergen flags are unverified", () => {
  it("does not claim green No allergens from empty or missing flags", () => {
    for (const flags of [undefined, [], null]) {
      const report = tortillasReport(flags);
      expect(report.lineCount).toBe(1);
      expect(report.unresolvedCount).toBe(0);
      expect(report.unflaggedCount).toBe(1);
      expect(report.codes).toEqual([]);
      expect(dishAllergenClaim(report)).toBe("unverified");
      expect(dishAllergenClaim(report)).not.toBe("clear");
    }
  });

  it("still reports Contains when an ingredient is actually flagged", () => {
    const report = tortillasReport(["wheat"]);
    expect(report.codes).toEqual(["wheat"]);
    expect(report.unflaggedCount).toBe(0);
    expect(dishAllergenClaim(report)).toBe("contains");
  });

  it("keeps Contains but marks incomplete when some lines are unflagged", () => {
    const report = deriveDishAllergens(
      { _id: "dish-tacos" },
      {
        dishIngredients: [
          {
            _id: "di-1",
            dishId: "dish-tacos",
            ingredientId: "ing-flour",
          },
          {
            _id: "di-2",
            dishId: "dish-tacos",
            ingredientId: "ing-crema",
          },
        ],
        dishComponents: [],
        componentIngredients: [],
        ingredients: [
          { _id: "ing-flour", name: "Flour Tortillas", allergens: ["wheat"] },
          { _id: "ing-crema", name: "Sour Cream", allergens: [] },
        ],
      },
    );
    expect(report.codes).toEqual(["wheat"]);
    expect(report.unflaggedCount).toBe(1);
    expect(dishAllergenClaim(report)).toBe("contains");
  });
});
