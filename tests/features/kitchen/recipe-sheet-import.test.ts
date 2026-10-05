import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ComponentImportCoordinator } from "../../../src/features/kitchen/import/ComponentImportCoordinator";
import {
  isRecipeSheet,
  parseRecipeSheet,
  sheetMinutes,
} from "../../../src/features/kitchen/import/RecipeSheetParser";

const sheet = readFileSync(
  join(__dirname, "../../fixtures/recipe-sheet/pomodoro-sauce.csv"),
  "utf8",
);

describe("owner's recipe sheet import (PL-RECIPE-SHEET part 2)", () => {
  it("knows the one-file sheet from other recipe files", () => {
    expect(isRecipeSheet(sheet)).toBe(true);
    expect(isRecipeSheet("component_name,description\nX,Y")).toBe(false);
    expect(isRecipeSheet("Pomodoro sauce\n2 cups onion")).toBe(false);
  });

  it("reads the recipe, its yield, times, allergens, equipment, steps and packaging", () => {
    const { draft, extras } = parseRecipeSheet(sheet, "recipe_sheet.csv");
    expect(draft.name).toBe("Pomodoro Sauce");
    expect(draft.yieldQuantity).toBe(10);
    expect(draft.yieldUnit).toBe("gallon");
    expect(draft.description).toBe("Recipe sheet version 2026.01");
    expect(extras.activePrepMinutes).toBe(20);
    expect(extras.passiveCookMinutes).toBe(60);
    expect(extras.allergens).toEqual(["wheat"]);
    expect(extras.equipment).toEqual([
      "Tilt Skillet",
      "Immersion Blender",
      "200 Pans",
      "Tilt Skillet Spatula",
      "Measuring Cups",
    ]);
    expect(extras.steps).toHaveLength(9);
    expect(extras.steps[0]).toBe(
      "IN TILT SKILLET HEAT 1/2 CUPS OF OLIVE OIL UNTIL HOT",
    );
    expect(extras.packaging.map((p) => p.key)).toEqual([
      "drop_off",
      "bring_hot",
      "cook_on_site",
    ]);
    expect(draft.instructions?.split("\n")).toHaveLength(9);
  });

  it("reads every ingredient amount, and #10 cans as cans, not pounds", () => {
    const { draft } = parseRecipeSheet(sheet);
    const lines = draft.lines.map((l) => [l.name, l.quantity, l.unit]);
    expect(lines).toEqual([
      ["Diced Onion", 5, "pound"],
      ["Diced Celery", 2.5, "pound"],
      ["Diced Carrot", 2.5, "pound"],
      ["Minced Garlic", 2, "cup"],
      ["Dried Basil", 0.5, "cup"],
      ["Dried Oregano", 0.5, "cup"],
      ["Dried Thyme", 0.5, "cup"],
      ["Salt", 0.25, "cup"],
      ["Diced Tomato (in Juice)", 6, "can"],
      ["Tomato Paste (super Heavy Pizza Sauce)", 3, "can"],
    ]);
    expect(draft.lines[8].prepNotes).toBe("#10 cans");
  });

  it("matches ingredients to the ingredient list through the normal review", () => {
    const review = new ComponentImportCoordinator().parseTextFile(
      sheet,
      "recipe_sheet.csv",
      [{ id: "ing-salt", name: "Salt" }],
    );
    expect(review.name).toBe("Pomodoro Sauce");
    expect(review.lines).toHaveLength(10);
    const salt = review.lines.find((l) => l.name === "Salt");
    expect(salt?.matchedIngredientId).toBe("ing-salt");
  });

  it("reads plain time words", () => {
    expect(sheetMinutes("1 HOUR 20 MINUTES")).toBe(80);
    expect(sheetMinutes("1.5 hours")).toBe(90);
    expect(sheetMinutes("45")).toBe(45);
    expect(sheetMinutes("SEE PREP BOARD")).toBeNull();
  });
});
