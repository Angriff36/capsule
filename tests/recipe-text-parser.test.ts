import { describe, expect, it } from "vitest";
import { IngredientCatalogMatcher } from "../src/features/kitchen/import/IngredientCatalogMatcher";
import { RecipeImportCoordinator } from "../src/features/kitchen/import/RecipeImportCoordinator";
import { RecipeImportFinalizer } from "../src/features/kitchen/import/RecipeImportFinalizer";
import { RecipeTextParser } from "../src/features/kitchen/import/RecipeTextParser";
import { UnitOfMeasureMapper } from "../src/features/kitchen/import/UnitOfMeasureMapper";

const SAMPLE = `One-Pot Chili

A low-fat chili that is easy to clean up.

Yield: 6 servings

Ingredients:
1 lb lean ground turkey
1 small onion, chopped
1/4 cup green bell pepper, chopped
1 can (15 oz) pinto beans, rinsed and drained
2 tsp chili powder

Instructions:
1. Brown the turkey.
2. Simmer 15 minutes.`;

describe("UnitOfMeasureMapper", () => {
  it("maps common culinary aliases onto the closed vocabulary", () => {
    const mapper = new UnitOfMeasureMapper();
    expect(mapper.map("lb")).toBe("pound");
    expect(mapper.map("tsp")).toBe("teaspoon");
    expect(mapper.map("cans")).toBe("each");
    expect(mapper.map("servings")).toBe("portion");
  });
});

describe("RecipeTextParser", () => {
  it("parses name, yield, ingredients, and instructions", () => {
    const parsed = new RecipeTextParser().parse(SAMPLE);
    expect(parsed.name).toBe("One-Pot Chili");
    expect(parsed.yieldQuantity).toBe(6);
    expect(parsed.yieldUnit).toBe("portion");
    expect(parsed.lines.length).toBe(5);
    expect(parsed.lines[0]).toMatchObject({
      name: "Lean Ground Turkey",
      quantity: 1,
      unit: "pound",
    });
    expect(parsed.lines[1]).toMatchObject({
      name: "Onion",
      unit: "each",
      prepNotes: "chopped",
    });
    expect(parsed.lines[2].quantity).toBeCloseTo(0.25);
    expect(parsed.lines[2].unit).toBe("cup");
    expect(parsed.lines[3]).toMatchObject({
      name: "Pinto Beans",
      unit: "each",
    });
    expect(parsed.lines[3].prepNotes).toMatch(/rinsed/i);
    expect(parsed.instructions).toContain("Brown the turkey");
  });
});

describe("IngredientCatalogMatcher", () => {
  it("marks exact, partial, and new matches", () => {
    const matcher = new IngredientCatalogMatcher();
    const catalog = [
      { id: "ing-1", name: "Onion" },
      { id: "ing-2", name: "Bell Pepper, Green" },
    ];
    const exact = matcher.matchLine(
      {
        raw: "1 onion",
        name: "Onion",
        quantity: 1,
        unit: "each",
        unitRaw: "each",
      },
      catalog,
    );
    expect(exact.matchStatus).toBe("matched");
    expect(exact.matchedIngredientId).toBe("ing-1");

    const partial = matcher.matchLine(
      {
        raw: "1/4 cup green bell pepper",
        name: "Green Bell Pepper",
        quantity: 0.25,
        unit: "cup",
        unitRaw: "cup",
      },
      catalog,
    );
    expect(partial.matchStatus).toBe("partial");
    expect(partial.matchedIngredientId).toBe("ing-2");

    const created = matcher.matchLine(
      {
        raw: "1 lb turkey",
        name: "Lean Ground Turkey",
        quantity: 1,
        unit: "pound",
        unitRaw: "lb",
      },
      catalog,
    );
    expect(created.matchStatus).toBe("new");
    expect(created.createNew).toBe(true);
  });
});

describe("RecipeImportFinalizer", () => {
  it("creates missing ingredients, recipe, and lines in order", async () => {
    const calls: string[] = [];
    const review = new RecipeImportCoordinator().parseAndMatch(SAMPLE, [
      { id: "ing-onion", name: "Onion" },
    ]);
    const finalizer = new RecipeImportFinalizer({
      createIngredient: async (input) => {
        calls.push(`ingredient:${input.name}`);
        return { docId: `new-${input.name}` };
      },
      createRecipe: async (input) => {
        calls.push(`recipe:${input.name}`);
        return { docId: "recipe-1" };
      },
      createRecipeIngredient: async (input) => {
        calls.push(`line:${input.ingredientId}`);
        return { docId: `line-${input.sortOrder}` };
      },
    });

    const result = await finalizer.finalize(review);
    expect(result.recipeId).toBe("recipe-1");
    expect(result.lineIds).toHaveLength(review.lines.length);
    expect(calls[0]).toMatch(/^ingredient:/);
    expect(calls).toContain("recipe:One-Pot Chili");
    expect(calls.some((call) => call === "line:ing-onion")).toBe(true);
  });
});
