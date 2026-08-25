import { describe, expect, it } from "vitest";
import {
  buildEventMenuCost,
  eventMenuDishEstimateKind,
  eventMenuHeaderServings,
  eventMenuHeaderUnpricedNote,
  eventMenuUnpricedEstimateLabel,
} from "../src/features/events/eventMenuCost";
import { eventMenuContainerCount } from "../src/features/events/eventMenuContainers";

// TEST DATA — catalog fixture for leftover 1, not product UI.
const TEST_CATALOG_UNIT_COST = 6.25;

describe("event menu cost rollup", () => {
  it("rolls 98 servings from catalog unit cost when recipe and stock units match", () => {
    const rollup = buildEventMenuCost({
      eventId: "event-planning",
      expectedHeadcount: 98,
      eventDishes: [
        {
          id: "event-dish-pollo",
          eventId: "event-planning",
          dishId: "dish-pollo",
          quantityServings: 98,
        },
      ],
      dishIngredients: [
        {
          id: "line-tomato",
          dishId: "dish-pollo",
          ingredientId: "ing-tomato",
          quantity: 1,
          unit: "kilogram",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-tomato",
          name: "Heirloom Tomato",
          unit: "kilogram",
          costPerUnit: TEST_CATALOG_UNIT_COST,
        },
      ],
    });

    expect(rollup.servings).toBe(98);
    expect(rollup.foodCost).toBeCloseTo(98 * TEST_CATALOG_UNIT_COST);
    expect(rollup.costPerServing).toBeCloseTo(TEST_CATALOG_UNIT_COST);
    expect(rollup.mismatches).toEqual([]);
    expect(rollup.pricedLineCount).toBe(1);
  });

  it("prefers a receipt price over catalog when present", () => {
    const rollup = buildEventMenuCost({
      eventId: "event-planning",
      expectedHeadcount: 10,
      eventDishes: [
        {
          id: "event-dish-1",
          eventId: "event-planning",
          dishId: "dish-1",
          quantityServings: 10,
        },
      ],
      dishIngredients: [
        {
          id: "line-1",
          dishId: "dish-1",
          ingredientId: "ing-oil",
          quantity: 1,
          unit: "liter",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-oil",
          name: "Olive oil",
          unit: "liter",
          costPerUnit: 4,
        },
      ],
      priceObservations: [
        {
          _id: "obs-1",
          ingredientId: "ing-oil",
          vendorId: "v1",
          vendorOrderId: "o1",
          vendorOrderLineId: "l1",
          receiptQuantity: 1,
          cumulativeReceivedQuantity: 1,
          unit: "liter",
          unitPrice: 8,
          observedAt: 100,
        },
      ],
    });
    expect(rollup.foodCost).toBeCloseTo(80);
  });

  it("warns on recipe each vs stock kilogram and does not invent a conversion", () => {
    const rollup = buildEventMenuCost({
      eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
      expectedHeadcount: 98,
      eventDishes: [
        {
          id: "event-dish-pollo",
          eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
          dishId: "ks73p50129xt3cvfw2zyvbrgdx8crrpx",
          quantityServings: 98,
        },
      ],
      dishIngredients: [
        {
          id: "line-tomato",
          dishId: "ks73p50129xt3cvfw2zyvbrgdx8crrpx",
          ingredientId: "ing-tomato",
          quantity: 1,
          unit: "each",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-tomato",
          name: "Heirloom Tomato",
          unit: "kilogram",
          costPerUnit: TEST_CATALOG_UNIT_COST,
        },
      ],
    });

    expect(rollup.foodCost).toBe(0);
    expect(rollup.foodCost).not.toBe(98 * TEST_CATALOG_UNIT_COST);
    expect(rollup.mismatches).toHaveLength(1);
    expect(rollup.mismatches[0]?.recipeUnit).toBe("each");
    expect(rollup.mismatches[0]?.stockUnit).toBe("kilogram");
    expect(rollup.mismatches[0]?.message).toMatch(/not converted/i);
  });

  it("converts compatible mass units instead of requiring an exact label match", () => {
    const rollup = buildEventMenuCost({
      eventId: "event-1",
      expectedHeadcount: 2,
      eventDishes: [
        {
          id: "ed-1",
          eventId: "event-1",
          dishId: "dish-1",
          quantityServings: 2,
        },
      ],
      dishIngredients: [
        {
          id: "line-1",
          dishId: "dish-1",
          ingredientId: "ing-flour",
          quantity: 500,
          unit: "gram",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-flour",
          name: "Flour",
          unit: "kilogram",
          costPerUnit: 4,
        },
      ],
    });
    expect(rollup.costPerServing).toBeCloseTo(2);
    expect(rollup.foodCost).toBeCloseTo(4);
    expect(rollup.mismatches).toEqual([]);
  });

  it("header servings is guest count, not 20 dishes × 98", () => {
    const eventDishes = Array.from({ length: 20 }, (_, index) => ({
      id: `event-dish-${index}`,
      eventId: "event-planning",
      dishId: `dish-${index}`,
      quantityServings: 98,
    }));
    const rollup = buildEventMenuCost({
      eventId: "event-planning",
      expectedHeadcount: 98,
      eventDishes,
      dishIngredients: [],
      ingredients: [],
    });
    expect(eventMenuHeaderServings(98, Array(20).fill(98))).toBe(98);
    expect(eventMenuHeaderServings(98, Array(20).fill(98))).not.toBe(1960);
    expect(rollup.servings).toBe(98);
    expect(rollup.servings).not.toBe(20 * 98);
    expect(rollup.servings).not.toBe(1960);
  });

  it("same-unit catalog cost rolls up money (TEST DATA fixture, not product UI)", () => {
    const rollup = buildEventMenuCost({
      eventId: "event-planning",
      expectedHeadcount: 98,
      eventDishes: [
        {
          id: "event-dish-priced",
          eventId: "event-planning",
          dishId: "dish-priced",
          quantityServings: 98,
        },
        ...Array.from({ length: 19 }, (_, index) => ({
          id: `event-dish-empty-${index}`,
          eventId: "event-planning",
          dishId: `dish-empty-${index}`,
          quantityServings: 98,
        })),
      ],
      dishIngredients: [
        {
          id: "line-oil",
          dishId: "dish-priced",
          ingredientId: "ing-oil",
          quantity: 1,
          unit: "liter",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-oil",
          name: "Olive oil",
          unit: "liter",
          costPerUnit: TEST_CATALOG_UNIT_COST,
        },
      ],
    });
    expect(rollup.servings).toBe(98);
    expect(rollup.servings).not.toBe(1960);
    expect(rollup.foodCost).toBeCloseTo(98 * TEST_CATALOG_UNIT_COST);
    expect(rollup.costPerServing).toBeCloseTo(TEST_CATALOG_UNIT_COST);
    expect(rollup.pricedLineCount).toBe(1);
    expect(rollup.mismatches).toEqual([]);
    const priced = rollup.dishes.find((dish) => dish.dishId === "dish-priced");
    expect(eventMenuDishEstimateKind(priced)).toBe("priced");
  });

  it("mismatch estimate is an explicit unpriced label, not a missing rollup", () => {
    const rollup = buildEventMenuCost({
      eventId: "event-planning",
      expectedHeadcount: 98,
      eventDishes: [
        {
          id: "event-dish-pollo",
          eventId: "event-planning",
          dishId: "dish-pollo",
          quantityServings: 98,
        },
      ],
      dishIngredients: [
        {
          id: "line-tomato",
          dishId: "dish-pollo",
          ingredientId: "ing-tomato",
          quantity: 1,
          unit: "each",
          addedAt: 1,
        },
      ],
      ingredients: [
        {
          id: "ing-tomato",
          name: "Heirloom Tomato",
          unit: "kilogram",
          costPerUnit: TEST_CATALOG_UNIT_COST,
        },
      ],
    });
    expect(rollup.foodCost).toBe(0);
    expect(eventMenuDishEstimateKind(rollup.dishes[0])).toBe("unit_mismatch");
    expect(
      eventMenuUnpricedEstimateLabel(
        eventMenuDishEstimateKind(rollup.dishes[0]),
      ),
    ).toBe("— (units not converted)");
    expect(eventMenuHeaderUnpricedNote(rollup)).toBe(
      "estimate unpriced (units not converted)",
    );
  });
});

describe("event menu container counts", () => {
  it("counts pans from headcount without requiring a kitchen trip", () => {
    expect(eventMenuContainerCount(98, 20, 0)).toBe(5);
    expect(eventMenuContainerCount(98, 20, 1)).toBe(6);
  });
});

import { buildLiveEventProfitability } from "../src/features/events/liveEventProfitability";

describe("margin leftover 6 — recipe estimate is food cost when no PO exists", () => {
  it("does not stay $0 just because no submitted PO exists", () => {
    const result = buildLiveEventProfitability({
      eventId: "event-1",
      invoices: [
        {
          eventId: "event-1",
          status: "sent",
          total: 2000,
        },
      ],
      demands: [],
      orders: [],
      lines: [],
      lineDemands: [],
      payrollInputs: [],
      equipment: [],
      equipmentReservations: [],
      recipeEstimatedFoodCost: 612.5,
    });
    expect(result.ingredientCost).toBeCloseTo(612.5);
    expect(result.totalCommittedCost).toBeCloseTo(612.5);
    expect(result.marginPercent).not.toBeNull();
    expect(result.ingredientCostSource).toBe("recipe");
  });

  it("keeps recipe as the food-cost source when the estimate is $0", () => {
    const result = buildLiveEventProfitability({
      eventId: "event-1",
      invoices: [],
      demands: [],
      orders: [],
      lines: [],
      lineDemands: [],
      payrollInputs: [],
      equipment: [],
      equipmentReservations: [],
      recipeEstimatedFoodCost: 0,
    });
    expect(result.ingredientCost).toBe(0);
    expect(result.ingredientCostSource).toBe("recipe");
  });
});
