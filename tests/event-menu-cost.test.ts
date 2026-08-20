import { describe, expect, it } from "vitest";
import { buildEventMenuCost } from "../src/features/events/eventMenuCost";
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
  });
});
