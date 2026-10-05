// AC-450 (BE-9.4): missing yield, incompatible units, a removed ingredient or
// an unknown price each become a notice on that one line. None of them turns
// into "each", a zero need or a made-up conversion, the rest of the dish stays
// exact, and the recipe stays usable in the kitchen while its cost is unknown.
import { describe, expect, it } from "vitest";
import {
  componentBatchCost,
  componentContentStatus,
  type ComponentLike,
  type IngredientLike,
} from "../convex/lib/culinaryModel/costing";
import {
  expandEventDish,
  purchasingTotals,
  type DemandLookups,
  type DishLike,
} from "../convex/lib/culinaryModel/demand";

const butter: IngredientLike = {
  id: "ing-butter",
  name: "Butter",
  unit: "pound",
  costPerUnit: 4,
};
const flour: IngredientLike = {
  id: "ing-flour",
  name: "Flour",
  unit: "pound",
  costPerUnit: 1,
};
// Priced per pound, used by the cup, no density on file.
const honey: IngredientLike = {
  id: "ing-honey",
  name: "Honey",
  unit: "pound",
  costPerUnit: 6,
};
// No price yet.
const saffron: IngredientLike = {
  id: "ing-saffron",
  name: "Saffron",
  unit: "gram",
  costPerUnit: null,
};

const line = (
  id: string,
  ingredientId: string,
  quantity: number,
  unit: ComponentLike["ingredientLines"][number]["unit"],
) => ({
  id,
  ingredientId,
  quantity,
  unit,
  quantityBasis: "as_purchased" as const,
});

const glaze: ComponentLike = {
  id: "cmp-glaze",
  name: "Honey glaze",
  // Yield never entered: nothing can be scaled from it.
  yieldQuantity: 0,
  yieldUnit: "cup",
  instructions: "Warm and whisk.",
  stepCount: 1,
  ingredientLines: [line("g1", "ing-butter", 0.5, "pound")],
  componentLines: [],
};

const cake: ComponentLike = {
  id: "cmp-cake",
  name: "Saffron honey cake",
  yieldQuantity: 10,
  yieldUnit: "portion",
  instructions: "Cream butter, fold in flour, bake 40 minutes.",
  stepCount: 3,
  ingredientLines: [
    line("c1", "ing-butter", 1, "pound"),
    line("c2", "ing-flour", 2, "pound"),
    line("c3", "ing-honey", 1, "cup"),
    line("c4", "ing-saffron", 0.5, "gram"),
    line("c5", "ing-gone", 3, "each"),
  ],
  componentLines: [
    {
      id: "c6",
      childComponentId: "cmp-glaze",
      quantity: 1,
      unit: "cup",
      quantityBasis: "as_produced",
    },
  ],
};

const dish: DishLike = {
  id: "dish-cake",
  name: "Saffron honey cake",
  kind: "food",
  ingredientLines: [],
  componentLines: [
    {
      id: "dc-cake",
      componentId: "cmp-cake",
      yieldQuantity: 10,
      batchMultiplier: 1,
      quantityBasis: "as_produced",
    },
  ],
  tasks: [
    {
      id: "dt-bake",
      name: "Bake saffron honey cake",
      componentId: "cmp-cake",
      materialDishIngredientIds: [],
      materialDishComponentIds: ["dc-cake"],
    },
  ],
};

const lookups: DemandLookups = {
  dishes: new Map([[dish.id, dish]]),
  components: new Map([glaze, cake].map((c) => [c.id, c])),
  ingredients: new Map([butter, flour, honey, saffron].map((i) => [i.id, i])),
  portionSpecs: new Map(),
  mappings: [],
};

describe("AC-450: missing culinary data is a notice on that line, never a guess", () => {
  const demand = expandEventDish(
    {
      id: "ed-cake",
      eventId: "ev",
      dishId: dish.id,
      quantityServings: 20,
      overrides: [],
      prepTasks: [],
    },
    lookups,
  );
  const row = (ingredientId: string) =>
    demand.contributions.filter((c) => c.ingredientId === ingredientId);

  it("keeps the lines with complete data exact", () => {
    // 20 servings / 10 per batch = 2 cakes.
    expect(row("ing-butter")).toHaveLength(1);
    expect(row("ing-butter")[0]).toMatchObject({
      unit: "pound",
      purchasable: true,
    });
    expect(row("ing-butter")[0].quantity).toBeCloseTo(2, 6);
    expect(row("ing-flour")[0].quantity).toBeCloseTo(4, 6);
  });

  it("a recipe with no yield is a notice on that sub-recipe line, and adds no glaze demand", () => {
    const notice = demand.unresolved.find((u) => u.refId === "c6");
    expect(notice).toMatchObject({ kind: "unit" });
    // Glaze butter would ride on the glaze path; none is invented.
    expect(
      demand.contributions.filter((c) => c.componentPath.includes("cmp-glaze")),
    ).toHaveLength(0);
  });

  it("cups of honey priced by the pound stay cups and are not bought until a density is on file", () => {
    const honeyRows = row("ing-honey");
    expect(honeyRows).toHaveLength(1);
    expect(honeyRows[0].purchasable).toBe(false);
    expect(honeyRows[0].unitStatus).not.toBe("resolved");
    // The stated amount is kept as stated: 2 cakes x 1 cup.
    expect(honeyRows[0].exactQuantity).toBeCloseTo(2, 6);
    expect(honeyRows[0].unit).not.toBe("each");
    const totals = purchasingTotals(demand.contributions);
    expect(totals.complete).toBe(false);
    // The notice points at this one demand row, by its source key.
    expect(
      demand.unresolved.some(
        (u) => u.kind === "unit" && u.refId === honeyRows[0].sourceKey,
      ),
    ).toBe(true);
  });

  it("a removed ingredient is named as missing and adds nothing", () => {
    expect(row("ing-gone")).toHaveLength(0);
    expect(demand.unresolved).toContainEqual(
      expect.objectContaining({
        kind: "missing_reference",
        refId: "ing-gone",
      }),
    );
  });

  it("no line is turned into an 'each' count it did not have", () => {
    expect(demand.contributions.filter((c) => c.unit === "each")).toHaveLength(
      0,
    );
  });

  it("an unpriced ingredient leaves the cost partial with the known part apart, and the recipe stays cookable", () => {
    const cost = componentBatchCost("cmp-cake", lookups);
    expect(cost.confidence).not.toBe("complete");
    expect(cost.unknownLines).toBeGreaterThan(0);
    // Butter 1 lb x $4 + flour 2 lb x $1 are known; saffron, honey (no density),
    // the removed line and the glaze are not.
    expect(cost.knownSubtotal).toBeCloseTo(6, 6);
    expect(componentContentStatus(cake)).toBe("complete");
  });
});
