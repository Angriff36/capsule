// @vitest-environment jsdom
// AC-074 (PR03-09) — nutrition and allergen claims keep their unknown states.
// A recipe with no ingredient nutrition shows Unknown, never zeros; a value only
// some ingredients record shows as a floor; a count unit (each, bottle, portion)
// never gets a weight from a volume or a reference amount; an empty allergen
// list is never read out as allergen-free.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogUnitGrams as ServerCatalogUnitGrams } from "../../../convex/lib/catalogUnitGrams";
import {
  nutritionAppliedNote,
  nutritionSkippedReason,
} from "../../../convex/lib/ingredientLookupApplyNutrition";
import { CatalogUnitGrams as ClientCatalogUnitGrams } from "../../../src/lib/catalogUnitGrams";
import {
  canScaleNutritionToUnit,
  scaleNutritionFromGramsToUnit,
} from "../../../src/lib/nutritionUnitScale";
import { AllergenIconRow } from "../../../src/features/kitchen/AllergenIconRow";
import {
  calculateComponentNutrition,
  sumPerGuestNutrition,
  type ComponentNutritionIngredientInput,
} from "../../../src/features/kitchen/ComponentNutrition";
import { ComponentNutritionPanel } from "../../../src/features/kitchen/ComponentNutritionPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flour: ComponentNutritionIngredientInput = {
  id: "ing-flour",
  name: "Flour",
  unit: "gram",
};
const butter: ComponentNutritionIngredientInput = {
  id: "ing-butter",
  name: "Butter",
  unit: "gram",
  caloriesPerUnit: 7.17,
  fatGramsPerUnit: 0.81,
  sodiumMgPerUnit: 0,
};
const sugar: ComponentNutritionIngredientInput = {
  id: "ing-sugar",
  name: "Sugar",
  unit: "gram",
  caloriesPerUnit: 3.87,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function nutrientCell(key: string): string {
  return (
    container.querySelector(`[data-testid="nutrient-${key}"]`)?.textContent ??
    ""
  );
}

describe("AC-074 nutrition keeps unknown states", () => {
  it("a recipe with no ingredient nutrition renders explicit unknown, not zeros, and never shows a volumetric portion as count weight", () => {
    const summary = calculateComponentNutrition({
      lines: [
        { id: "l1", ingredientId: flour.id, quantity: 500, unit: "gram" },
      ],
      ingredients: [flour],
      servesPerYield: 10,
    });
    expect(summary.measuredLineCount).toBe(0);
    expect(Object.values(summary.coverage).every((s) => s === "unknown")).toBe(
      true,
    );

    act(() =>
      root.render(
        createElement(ComponentNutritionPanel, {
          portionLabel: "per portion",
          totals: summary.perPortion,
          coverage: summary.coverage,
        }),
      ),
    );
    for (const key of ["calories", "protein", "fat", "sodium", "iron"]) {
      expect(nutrientCell(key)).toBe("Unknown");
    }
    expect(container.textContent).not.toMatch(/\b0 kcal\b|\b0\.0 g\b/);

    // Count units: a volume, a typical bottle, or a 100 g reference amount is
    // never taken as the weight of one piece — on the server or in the forms.
    for (const Grams of [ServerCatalogUnitGrams, ClientCatalogUnitGrams]) {
      for (const unit of ["each", "bottle", "portion", "serving", "melon"]) {
        expect(Grams.resolve(unit, { gramsPerMl: 1.03 })).toBeUndefined();
        expect(Grams.resolve(unit, { foodName: "red wine" })).toBeUndefined();
        expect(Grams.resolve(unit)).toBeUndefined();
        expect(Grams.resolve(unit, { servingGramsPerEach: 50 })).toBe(50);
      }
      // Volume and weight units still scale.
      expect(Grams.resolve("cup", { gramsPerMl: 1 })).toBeCloseTo(236.588, 2);
      expect(Grams.resolve("pound")).toBeCloseTo(453.592, 2);
    }
    expect(
      scaleNutritionFromGramsToUnit(
        { caloriesPerUnit: 0.6 },
        "each",
        undefined,
        {
          gramsPerMl: 1.03,
          foodName: "milk",
        },
      ),
    ).toBeNull();
    expect(
      scaleNutritionFromGramsToUnit({ caloriesPerUnit: 0.6 }, "each", 40),
    ).toEqual({ caloriesPerUnit: 24 });
    expect(canScaleNutritionToUnit("each")).toBe(false);
    expect(canScaleNutritionToUnit("cup")).toBe(true);
    expect(nutritionSkippedReason("bottle")).toMatch(/known weight/);
    expect(nutritionAppliedNote("each", undefined, "serving")).toMatch(
      /label serving weight/,
    );
  });

  it("a nutrient only some ingredients record shows as at least, a recorded zero stays zero", () => {
    const summary = calculateComponentNutrition({
      lines: [
        { id: "l1", ingredientId: butter.id, quantity: 100, unit: "gram" },
        { id: "l2", ingredientId: sugar.id, quantity: 100, unit: "gram" },
        { id: "l3", ingredientId: flour.id, quantity: 100, unit: "gram" },
      ],
      ingredients: [butter, sugar, flour],
      servesPerYield: 1,
    });
    expect(summary.coverage.calories).toBe("partial");
    expect(summary.coverage.fat).toBe("partial");
    expect(summary.coverage.protein).toBe("unknown");

    const complete = calculateComponentNutrition({
      lines: [
        { id: "l1", ingredientId: butter.id, quantity: 10, unit: "gram" },
      ],
      ingredients: [butter],
      servesPerYield: 1,
    });
    expect(complete.coverage.sodium).toBe("complete");
    expect(complete.coverage.protein).toBe("unknown");

    act(() =>
      root.render(
        createElement(ComponentNutritionPanel, {
          portionLabel: "per portion",
          totals: summary.perPortion,
          coverage: summary.coverage,
        }),
      ),
    );
    expect(nutrientCell("calories")).toBe("at least 1104 kcal");
    expect(nutrientCell("protein")).toBe("Unknown");

    act(() =>
      root.render(
        createElement(ComponentNutritionPanel, {
          portionLabel: "per portion",
          totals: complete.perPortion,
          coverage: complete.coverage,
        }),
      ),
    );
    expect(nutrientCell("sodium")).toBe("0 mg");
    expect(nutrientCell("calories")).toBe("72 kcal");

    // Menu / event per-guest totals: an unknown component turns a complete
    // value into a floor; a nutrient no component records stays unknown.
    const perGuest = sumPerGuestNutrition([complete, summary]);
    expect(perGuest.coverage.calories).toBe("partial");
    expect(perGuest.coverage.protein).toBe("unknown");
    expect(sumPerGuestNutrition([complete]).coverage.sodium).toBe("complete");
    expect(sumPerGuestNutrition([]).coverage.calories).toBe("unknown");
  });

  it("an empty allergen list is never read out as allergen-free", () => {
    act(() => root.render(createElement(AllergenIconRow, { codes: [] })));
    const label = container.firstElementChild?.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/not an allergen-free check/);
    expect(label).not.toMatch(/^No allergens listed$/);
  });
});
