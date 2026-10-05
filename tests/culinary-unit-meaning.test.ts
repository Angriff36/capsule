// AC-068 (PR03-03): quantities keep their meaning. Mixed fractions, tiny
// amounts, mass, volume, count, batch, yield, waste factor and purchase packs
// never change meaning; fluid ounces are never mass ounces; an unknown
// conversion never becomes "each" or a fractional need rounded to one.
import { describe, expect, it } from "vitest";
import {
  applyRounding,
  expandEventDish,
  purchasingTotals,
  type DemandLookups,
  type DishLike,
} from "../convex/lib/culinaryModel/demand";
import {
  convertQuantity,
  roundTo,
  toPurchaseBasis,
  type ItemUnitMappingLike,
} from "../convex/lib/culinaryModel/units";
import { componentBatchScale } from "../src/lib/componentBatchScale";
import { recipeUnitRatio } from "../src/lib/recipeUnitConversion";
import { ComponentTextParser } from "../src/features/kitchen/import/ComponentTextParser";

const parser = new ComponentTextParser();
const line = (text: string) => parser.parseIngredientLine(text);

describe("recipe text keeps the amount and unit the cook wrote", () => {
  it("reads mixed fractions exactly, with or without a space before the glyph", () => {
    expect(line("1 ½ cups flour")).toMatchObject({
      quantity: 1.5,
      unit: "cup",
      name: "Flour",
    });
    expect(line("1½ cups flour")).toMatchObject({
      quantity: 1.5,
      unit: "cup",
      name: "Flour",
    });
    expect(line("2 ¾ lb beef")).toMatchObject({
      quantity: 2.75,
      unit: "pound",
    });
    expect(line("1 1/2 lb beef")).toMatchObject({
      quantity: 1.5,
      unit: "pound",
    });
    expect(line("⅛ tsp saffron")).toMatchObject({
      quantity: 0.125,
      unit: "teaspoon",
    });
  });

  it("reads fluid ounces as volume and plain ounces as weight", () => {
    for (const text of [
      "2 fl oz lemon juice",
      "2 fl. oz. lemon juice",
      "2 floz lemon juice",
      "2 fluid ounces lemon juice",
    ]) {
      expect(line(text)).toMatchObject({
        quantity: 2,
        unit: "fluid_ounce",
        name: "Lemon Juice",
      });
    }
    expect(line("2 oz butter")).toMatchObject({
      unit: "ounce",
      name: "Butter",
    });
    expect(line("2 oz. butter")).toMatchObject({
      unit: "ounce",
      name: "Butter",
    });
  });

  it("keeps a can as a can and an unknown unit as a correction, never each", () => {
    expect(line("2 cans tomatoes")).toMatchObject({
      quantity: 2,
      unit: "can",
      unitRaw: "cans",
    });
    expect(line("2 medium onions")).toMatchObject({ quantity: 2, unit: null });
    expect(line("1/0 cup cream")).toMatchObject({
      quantity: null,
      unit: "cup",
    });
  });

  it("keeps tiny amounts", () => {
    expect(line("0.005 oz saffron")).toMatchObject({
      quantity: 0.005,
      unit: "ounce",
    });
  });
});

describe("conversions keep dimension and never guess", () => {
  it("converts fluid ounces inside volume and refuses weight without a density", () => {
    expect(convertQuantity(8, "fluid_ounce", "cup").quantity).toBeCloseTo(1, 9);
    expect(convertQuantity(2, "fluid_ounce", "ounce")).toMatchObject({
      quantity: 2,
      unit: "fluid_ounce",
      status: "unresolved_no_density",
    });
    expect(recipeUnitRatio("fluid_ounce", "cup")).toBeCloseTo(0.125, 12);
    expect(recipeUnitRatio("cup", "fluid_ounce")).toBeCloseTo(8, 12);
    expect(recipeUnitRatio("fluid_ounce", "ounce")).toBeNull();
    expect(recipeUnitRatio("ounce", "fluid_ounce")).toBeNull();
  });

  it("count, batch and pack units convert only through the item's own mapping", () => {
    expect(convertQuantity(3, "batch", "each").status).toBe(
      "unresolved_no_mapping",
    );
    expect(convertQuantity(2, "can", "each").status).toBe(
      "unresolved_no_mapping",
    );
    expect(recipeUnitRatio("batch", "each")).toBeNull();
    const pack: ItemUnitMappingLike[] = [
      {
        ingredientId: "tom",
        kind: "pack",
        unit: "can",
        equalsQuantity: 28,
        equalsUnit: "ounce",
      },
    ];
    expect(
      convertQuantity(2, "can", "pound", pack, {
        itemKind: "ingredient",
        itemId: "tom",
      }),
    ).toMatchObject({ status: "resolved", quantity: 3.5 });
    // A partial can in the other direction stays partial.
    expect(
      convertQuantity(14, "ounce", "can", pack, {
        itemKind: "ingredient",
        itemId: "tom",
      }).quantity,
    ).toBeCloseTo(0.5, 9);
  });

  it("cooked amounts need a confirmed yield, never a guess", () => {
    expect(toPurchaseBasis(10, "ounce", "cooked")).toMatchObject({
      quantity: 10,
      status: "yield_not_confirmed",
    });
    const yieldMap: ItemUnitMappingLike[] = [
      {
        ingredientId: "bacon",
        kind: "yield",
        unit: "pound",
        equalsQuantity: 0.25,
        equalsUnit: "pound",
        fromBasis: "raw",
        toBasis: "cooked",
      },
    ];
    expect(
      toPurchaseBasis(1, "pound", "cooked", yieldMap, {
        itemKind: "ingredient",
        itemId: "bacon",
      }),
    ).toMatchObject({ quantity: 4, status: "resolved" });
  });

  it("rounding keeps tiny values and does not force a fraction up to one", () => {
    expect(roundTo(0.01 / 453.59237)).toBeGreaterThan(0);
    expect(roundTo(0.01 / 453.59237)).toBeCloseTo(0.00002205, 9);
    expect(roundTo(1 / 3)).toBe(0.3333);
    expect(roundTo(12.345678)).toBe(12.3457);
    expect(applyRounding(0.3, "none")).toBe(0.3);
  });

  it("measured batch ratios stay exact for small per-guest amounts", () => {
    expect(componentBatchScale(5, 0.0234375)).toEqual({
      yieldQuantity: 640,
      batchMultiplier: 3,
    });
  });
});

describe("event demand keeps waste, tiny amounts and units", () => {
  const dish: DishLike = {
    id: "d1",
    name: "Paella",
    kind: "food",
    ingredientLines: [
      {
        id: "di-saffron",
        ingredientId: "saffron",
        quantity: 0.01,
        unit: "gram",
        quantityBasis: "as_purchased",
      },
      {
        id: "di-rice",
        ingredientId: "rice",
        quantity: 4,
        unit: "ounce",
        quantityBasis: "as_purchased",
        wasteFactor: 1.1,
      },
      {
        id: "di-stock",
        ingredientId: "stock",
        quantity: 6,
        unit: "fluid_ounce",
        quantityBasis: "as_purchased",
      },
      {
        id: "di-oil",
        ingredientId: "oil",
        quantity: 1,
        unit: "fluid_ounce",
        quantityBasis: "as_purchased",
      },
    ],
    componentLines: [],
    tasks: [],
  };
  const lk: DemandLookups = {
    dishes: new Map([[dish.id, dish]]),
    components: new Map(),
    ingredients: new Map([
      [
        "saffron",
        { id: "saffron", name: "Saffron", unit: "pound", costPerUnit: null },
      ],
      ["rice", { id: "rice", name: "Rice", unit: "pound", costPerUnit: null }],
      [
        "stock",
        { id: "stock", name: "Stock", unit: "quart", costPerUnit: null },
      ],
      ["oil", { id: "oil", name: "Oil", unit: "pound", costPerUnit: null }],
    ]),
    portionSpecs: new Map(),
    mappings: [],
  };
  const demand = expandEventDish(
    {
      id: "ed1",
      eventId: "ev1",
      dishId: dish.id,
      quantityServings: 3,
      overrides: [],
      prepTasks: [],
    },
    lk,
  );
  const byIngredient = (id: string) =>
    demand.contributions.find((c) => c.ingredientId === id)!;

  it("a pinch for three guests is still a pinch in pounds, not zero", () => {
    const saffron = byIngredient("saffron");
    expect(saffron.purchasable).toBe(true);
    expect(saffron.quantity).toBeGreaterThan(0);
    // Four significant digits: 0.00006614 lb (before: rounded to 0.0001).
    expect(saffron.quantity).toBeCloseTo(0.03 / 453.59237, 8);
  });

  it("waste factor is applied once and fluid ounces become quarts", () => {
    expect(byIngredient("rice").quantity).toBeCloseTo((4 * 1.1 * 3) / 16, 4);
    expect(byIngredient("stock")).toMatchObject({
      unit: "quart",
      purchasable: true,
    });
    expect(byIngredient("stock").quantity).toBeCloseTo(18 / 32, 4);
  });

  it("fluid ounces of oil against a weight-priced item stay unresolved with the source amount", () => {
    expect(byIngredient("oil")).toMatchObject({
      purchasable: false,
      unitStatus: "unresolved_no_density",
      quantity: 3,
      unit: "fluid_ounce",
    });
    const totals = purchasingTotals(demand.contributions);
    expect(totals.complete).toBe(false);
    expect(totals.unresolved).toContainEqual(
      expect.objectContaining({
        ingredientId: "oil",
        quantity: 3,
        unit: "fluid_ounce",
      }),
    );
  });
});
