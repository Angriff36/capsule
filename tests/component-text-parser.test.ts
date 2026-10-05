import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IngredientCatalogMatcher } from "../src/features/kitchen/import/IngredientCatalogMatcher";
import { ComponentCsvParser } from "../src/features/kitchen/import/ComponentCsvParser";
import { ComponentImportCoordinator } from "../src/features/kitchen/import/ComponentImportCoordinator";
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

  it("resolves strictly for imports: unknown units stay null, never each", () => {
    const mapper = new UnitOfMeasureMapper();
    expect(mapper.resolve("kg")).toBe("kilogram");
    // fluid_ounce joined the unit list 2026-09-14: volume, never the mass ounce.
    expect(mapper.resolve("fl oz")).toBe("fluid_ounce");
    expect(mapper.resolve("oz")).toBe("ounce");
    expect(mapper.resolve("mystery-pack")).toBeNull();
    expect(mapper.resolve("medium")).toBeNull(); // size word, not a unit
    expect(mapper.resolve("")).toBeNull();
    expect(mapper.map("medium")).toBe("each"); // legacy map stays permissive
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
    // "1 small onion" states no real unit: the size word stays recorded as
    // the raw token with a null unit, instead of a silent "each".
    expect(parsed.lines[1]).toMatchObject({
      name: "Onion",
      quantity: 1,
      unit: null,
      unitRaw: "small",
      prepNotes: "chopped",
    });
    expect(parsed.lines[2].quantity).toBeCloseTo(0.25);
    expect(parsed.lines[2].unit).toBe("cup");
    expect(parsed.instructions).toContain("Brown the turkey");
  });

  it("keeps a missing yield as an explicit gap instead of 1 portion", () => {
    const parsed = new ComponentTextParser().parse(
      "Sauce\n\nIngredients:\n2 kg flour\n",
    );
    expect(parsed.yieldQuantity).toBeNull();
    expect(parsed.yieldUnit).toBeNull();
    expect(parsed.warnings.join(" ")).toContain("Yield not found");
  });

  it("keeps unrecognized yield units and line units null with raw text preserved", () => {
    const parsed = new ComponentTextParser().parse(
      "Relish\n\nYield: 6 trays\n\nIngredients:\n1 medium onion, chopped\n2 fl oz lemon juice\ncase tomatoes\n",
    );
    expect(parsed.yieldQuantity).toBe(6);
    expect(parsed.yieldUnit).toBeNull();
    expect(parsed.warnings.join(" ")).toContain("trays");
    expect(parsed.lines[0]).toMatchObject({
      raw: "1 medium onion, chopped",
      name: "Onion",
      quantity: 1,
      unit: null,
      unitRaw: "medium",
      prepNotes: "chopped",
    });
    expect(parsed.lines[1]).toMatchObject({
      quantity: 2,
      unit: "fluid_ounce",
      unitRaw: "fl oz",
      name: "Lemon Juice",
    });
    expect(parsed.lines[2]).toMatchObject({
      raw: "case tomatoes",
      quantity: null,
      unit: null,
    });
  });

  it("keeps mixed fractions and fraction glyphs exact", () => {
    const parsed = new ComponentTextParser().parse(
      "Base\n\nYield: 2 quarts\n\nIngredients:\n1 1/2 cups water\n½ tsp citric acid\n",
    );
    expect(parsed.lines[0].quantity).toBeCloseTo(1.5);
    expect(parsed.lines[0].unit).toBe("cup");
    expect(parsed.lines[1].quantity).toBeCloseTo(0.5);
    expect(parsed.lines[1].unit).toBe("teaspoon");
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

  it("reads the kitchen's own recipe sheets with no headings (work/recipes)", () => {
    const parser = new ComponentTextParser();
    const pesto = parser.parse(readFixture("kitchen/Basil_Pesto.txt"));
    expect(pesto.name).toBe("BASIL PESTO");
    expect([pesto.yieldQuantity, pesto.yieldUnit]).toEqual([3, "pound"]);
    expect(pesto.lines).toHaveLength(5);
    expect(pesto.instructions).toBe(
      "1. BLEND ALL INGREDIENTS TOGETHER USING FOOD PROCESSOR\n2. FINAL SEASON WITH SALT AND PEPPER",
    );

    // Stages restart at 1; the steps keep their order, numbered straight through.
    const mac = parser.parse(readFixture("kitchen/Cougar_Gold_Mac_Sauce.txt"));
    expect([mac.yieldQuantity, mac.yieldUnit]).toEqual([5, "gallon"]);
    expect(mac.lines).toHaveLength(13);
    const steps = mac.instructions?.split("\n") ?? [];
    expect(steps).toHaveLength(7);
    expect(steps[0]).toBe("1. MELT BUTTER THEN ADD FLOUR");
    expect(steps[2]).toBe("3. ADD TO ROUX AND USE IMMERSION BLENDER TO MIX");
    expect(steps[6]).toMatch(/^7\. MIX CORNSTARCH/);
    expect(mac.lines.at(-1)).toMatchObject({
      name: "Water",
      quantity: 0.25,
      unit: "cup",
    });

    const butter = parser.parse(
      readFixture("kitchen/Honey_Cinnamon_Butter.txt"),
    );
    expect(butter.lines.at(-1)).toMatchObject({
      name: "Salt",
      quantity: 1,
      unit: "teaspoon",
    });
    expect(butter.instructions?.split("\n")).toHaveLength(2);
  });

  it("keeps sub-steps, wrapped step text and unmeasured lines from the macaroni salad sheet", () => {
    // Typed from work/recipes/prep recipe1.jpg as it pastes from the doc.
    const salad = new ComponentTextParser().parse(
      readFixture("kitchen/Macaroni_Salad.txt"),
    );
    expect([salad.yieldQuantity, salad.yieldUnit]).toEqual([3, "quart"]);
    expect(salad.lines.map((line) => line.name)).toEqual([
      "Whole Milk",
      "Mayonnaise",
      "Brown Sugar",
      "Salt And Pepper",
      "Elbow Macaroni",
      "Cider Vinegar",
      "Scallions",
      "Carrot",
      "Celery Rib",
    ]);
    expect(salad.lines[3]).toMatchObject({ quantity: null, unit: null });
    expect(salad.lines[6]).toMatchObject({
      quantity: 4,
      prepNotes: "sliced thin",
    });
    const steps = salad.instructions?.split("\n") ?? [];
    expect(steps[0]).toBe("1. Make dressing");
    expect(steps[1]).toBe(
      "   a. Whisk ¾ cups milk, 1 ½ cup mayonnaise, sugar, 1/2 teaspoon salt, and 2 teaspoons pepper in bowl",
    );
    expect(steps[2]).toBe("2. Cook pasta");
    expect(steps[4]).toBe(
      "   b. Add 1 tablespoon salt and pasta and cook until very soft, about 15 minutes",
    );
    expect(steps.filter((step) => /^\d+\. /.test(step))).toHaveLength(4);
    expect(steps).toHaveLength(15);
  });

  it("does not take a 'per 5 pounds of chicken' note or an ingredient amount as the yield", () => {
    const parser = new ComponentTextParser();
    const brine = parser.parse(readFixture("kitchen/BBQ_Chicken_Brine.txt"));
    expect(brine.yieldQuantity).toBeNull();
    expect(brine.warnings.join(" ")).toContain("Yield not found");
    expect(brine.description).toBe("*PER 5 POUNDS AIRLINE CHICKEN BREAST*");
    expect(brine.lines).toHaveLength(5);
    expect(brine.lines[4]).toMatchObject({
      name: "Whole Garlic Clove",
      prepNotes: "FRESH",
    });
    expect(brine.instructions).toBe(
      "1. BRING 2 CUPS WATER TO BOIL AND THOROUGHLY DISSOLVE SALT AND SUGAR. COMBINE WITH REMAINING COLD WATER, GARLIC, AND THYME. POUR OVER CHICKEN COMPLETELY SUBMERGING IT.",
    );

    const noYield = parser.parse("Pesto\n\n3 pounds basil\n1 cup oil\n");
    expect(noYield.yieldQuantity).toBeNull();
    expect(
      parser.parse("Iced Tea\nYields 2 gallons\n\n4 tea bags\n").lines[0],
    ).toMatchObject({ quantity: 4, unit: null });
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

  it("keeps missing or unrecognized CSV yield values as gaps, not defaults", () => {
    const sheet = [
      "component_name,description,category,cuisine,yield_quantity,yield_unit,batch_multiplier,instructions",
      "Sauce,,,,,trays,,",
    ].join("\n");
    const lines = [
      "component_name,source_order,source_line,quantity,unit,ingredient_name,preparation_note",
      "Sauce,1,1 cup water,,,,",
      "Sauce,2,2 lb tomatoes,,,",
    ].join("\n");
    const result = new ComponentCsvParser().parseBundle(sheet, lines);
    expect(result.errors).toEqual([]);
    expect(result.draft.yieldQuantity).toBeNull();
    expect(result.draft.yieldUnit).toBeNull();
    expect(result.draft.lines[0]).toMatchObject({
      quantity: 1,
      unit: "cup",
      raw: "1 cup water",
    });
    expect(result.draft.lines[1]).toMatchObject({ quantity: 2, unit: "pound" });
  });

  it("still reports structural CSV header errors", () => {
    const result = new ComponentCsvParser().parseBundle(
      "a,b\n1,2\n",
      "x,y\n3,4\n",
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatchObject({ row: 1 });
    expect(result.draft.lines).toEqual([]);
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
  it("blocks finalize readiness until lines are confirmed and measurements corrected", () => {
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
    // Matches are settled but "1 small onion" still has no valid unit.
    expect(reviewIsReady(resolved)).toBe(false);

    const corrected = {
      ...resolved,
      lines: resolved.lines.map((line) =>
        line.unit == null ? { ...line, unit: "each" as const } : line,
      ),
    };
    expect(reviewIsReady(corrected)).toBe(true);
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
