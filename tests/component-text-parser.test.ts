import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IngredientCatalogMatcher } from "../src/features/kitchen/import/IngredientCatalogMatcher";
import { ComponentCsvParser } from "../src/features/kitchen/import/ComponentCsvParser";
import { ComponentImportCoordinator } from "../src/features/kitchen/import/ComponentImportCoordinator";
import { ComponentImportFinalizer } from "../src/features/kitchen/import/ComponentImportFinalizer";
import { ComponentTextParser } from "../src/features/kitchen/import/ComponentTextParser";
import { SourceFingerprint } from "../src/features/kitchen/import/SourceFingerprint";
import { UnitOfMeasureMapper } from "../src/features/kitchen/import/UnitOfMeasureMapper";
import {
  countUnresolvedLines,
  reviewIsReady,
} from "../src/features/kitchen/import/ComponentImportTypes";

const readFixture = (name: string) =>
  readFileSync(`tests/fixtures/component-import/${name}`, "utf8");

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
    expect(mapper.map("C")).toBe("cup");
    expect(mapper.map("qts")).toBe("quart");
    expect(mapper.map("gals")).toBe("gallon");
    expect(mapper.isKnownAlias("C")).toBe(true);
  });
});

describe("SourceFingerprint", () => {
  it("is deterministic for the same source text", () => {
    const fingerprint = new SourceFingerprint();
    expect(fingerprint.digest("abc")).toBe(fingerprint.digest("abc"));
    expect(fingerprint.digest("abc")).not.toBe(fingerprint.digest("abcd"));
  });
});

describe("ComponentTextParser", () => {
  it("parses name, yield, ingredients, and instructions", () => {
    const parsed = new ComponentTextParser().parse(SAMPLE);
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
    expect(parsed.instructions).toContain("Brown the turkey");
  });

  it("handles pound notation and catering yields from fixtures", () => {
    const parsed = new ComponentTextParser().parse(
      readFixture("basil-pesto.txt"),
    );
    expect(parsed.yieldQuantity).toBe(2);
    expect(parsed.yieldUnit).toBe("pound");
    expect(parsed.lines[0]).toMatchObject({
      quantity: 2,
      unit: "pound",
      name: "Basil Leaves",
    });
  });

  it("does not treat numbered method steps as ingredients", () => {
    const parsed = new ComponentTextParser().parse(
      readFixture("basil-pesto-numbered-steps.txt"),
    );
    expect(parsed.yieldQuantity).toBe(2);
    expect(parsed.yieldUnit).toBe("quart");
    expect(parsed.lines.map((line) => line.name)).toEqual([
      "Basil Leaves",
      "Olive Oil",
      "Parmesan",
    ]);
    expect(parsed.lines.some((line) => /blend/i.test(line.name))).toBe(false);
    expect(parsed.instructions).toContain("Blend all ingredients");
  });

  it("maps C / qts / gallons yield and unit aliases", () => {
    const parser = new ComponentTextParser();
    expect(parser.mapUnitAlias("C")).toBe("cup");
    expect(parser.mapUnitAlias("qts")).toBe("quart");
    expect(parser.mapUnitAlias("gals")).toBe("gallon");
    const gallons = parser.parse(
      "Batch Sauce\n\nYield: 5 gallons\n\nIngredients:\n1 cup salt\n",
    );
    expect(gallons.yieldQuantity).toBe(5);
    expect(gallons.yieldUnit).toBe("gallon");
    const quarterCup = parser.parse(
      "Butter\n\nMakes 1/4 C\n\nIngredients:\n1/4 C honey\n",
    );
    expect(quarterCup.yieldQuantity).toBeCloseTo(0.25);
    expect(quarterCup.yieldUnit).toBe("cup");
    expect(quarterCup.lines[0]).toMatchObject({
      name: "Honey",
      unit: "cup",
      quantity: 0.25,
    });
  });
});

describe("ComponentCsvParser", () => {
  it("parses paired component sheet and line CSV fixtures", () => {
    const result = new ComponentCsvParser().parseBundle(
      readFixture("component_sheet.csv"),
      readFixture("component_lines.csv"),
    );
    expect(result.errors).toEqual([]);
    expect(result.draft.name).toBe("Basil Pesto");
    expect(result.draft.lines.length).toBeGreaterThan(0);
    expect(result.draft.yieldQuantity).toBe(2);
  });
});

describe("IngredientCatalogMatcher", () => {
  it("marks exact, possible, and new matches without auto-linking possible matches", () => {
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
    expect(exact.matchStatus).toBe("exact");
    expect(exact.matchedIngredientId).toBe("ing-1");

    const possible = matcher.matchLine(
      {
        raw: "1/4 cup green bell pepper",
        name: "Green Bell Pepper",
        quantity: 0.25,
        unit: "cup",
        unitRaw: "cup",
      },
      catalog,
    );
    expect(possible.matchStatus).toBe("possible");
    expect(possible.matchedIngredientId).toBeUndefined();
    expect(possible.possibleMatchIds.length).toBeGreaterThan(0);

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

describe("ComponentImportCoordinator", () => {
  it("blocks finalize readiness until non-exact lines are confirmed", () => {
    const review = new ComponentImportCoordinator().parseText(SAMPLE, [
      { id: "ing-onion", name: "Onion" },
    ]);
    expect(countUnresolvedLines(review.lines)).toBeGreaterThan(0);
    expect(reviewIsReady(review)).toBe(false);

    const resolved = {
      ...review,
      lines: review.lines.map((line) =>
        line.matchStatus === "exact"
          ? line
          : { ...line, matchStatus: "confirmed_new" as const, createNew: true },
      ),
    };
    expect(reviewIsReady(resolved)).toBe(true);
  });
});

describe("ComponentImportFinalizer", () => {
  it("creates missing ingredients, component, and lines in order", async () => {
    const calls: string[] = [];
    const review = new ComponentImportCoordinator().parseText(SAMPLE, [
      { id: "ing-onion", name: "Onion" },
    ]);
    const ready = {
      ...review,
      lines: review.lines.map((line) =>
        line.matchStatus === "exact"
          ? line
          : { ...line, matchStatus: "confirmed_new" as const, createNew: true },
      ),
    };
    const finalizer = new ComponentImportFinalizer({
      createIngredient: async (input) => {
        calls.push(`ingredient:${input.name}`);
        return { docId: `new-${input.name}` };
      },
      createComponent: async (input) => {
        calls.push(`component:${input.name}`);
        return { docId: "component-1" };
      },
      createComponentIngredient: async (input) => {
        calls.push(`line:${input.ingredientId}`);
        return { docId: `line-${input.sortOrder}` };
      },
    });

    const result = await finalizer.finalize(ready);
    expect(result.componentId).toBe("component-1");
    expect(result.lineIds).toHaveLength(ready.lines.length);
    expect(calls).toContain("component:One-Pot Chili");
  });
});

describe("kitchen route helpers", () => {
  it("exposes detail paths for culinary entities", async () => {
    const routes = await import("../src/features/kitchen/kitchenRoutes");
    expect(routes.ingredientPath("abc")).toBe("/kitchen/ingredients/abc");
    expect(routes.dishPath("abc")).toBe("/kitchen/dishes/abc");
    expect(routes.menuPath("abc")).toBe("/kitchen/menus/abc");
    expect(routes.COMPONENT_IMPORT_PATH).toBe("/kitchen/components/import");
  });
});
