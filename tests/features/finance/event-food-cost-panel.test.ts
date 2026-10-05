// @vitest-environment jsdom
// AC-334 / AC-071: the closeout and margin screens show the food-cost
// estimate beside the actual. An estimate with an unpriced ingredient says
// "at least", names the gap and claims no food-cost %; the actual shows
// purchases plus recorded waste. The data comes from the real engine.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventFoodCost } from "../../../convex/lib/culinaryModel/eventFoodCost";
import type { Contribution } from "../../../convex/lib/culinaryModel/demand";
import { EventFoodCostPanel } from "../../../src/features/finance/EventFoodCostPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({ report: undefined as unknown }));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(async () => null),
}));

vi.mock("../../../src/lib/culinaryDemandClient", async (importActual) => ({
  ...(await importActual<object>()),
  useEventFoodCost: () => harness.report,
}));

const contribution = (ingredientId: string, quantity: number): Contribution =>
  ({
    sourceKey: ingredientId,
    eventId: "ev-1",
    eventDishId: "ed-1",
    dishId: "dish-1",
    ingredientId,
    ingredientName: ingredientId,
    componentId: null,
    componentPath: [],
    quantity,
    unit: "pound",
    exactQuantity: quantity,
    statedUnit: "pound",
    quantityBasis: "as_purchased",
    unitStatus: "resolved",
    basisStatus: "resolved",
    ownership: "event_dish",
    sourceDishIngredientId: null,
    sourceDishComponentId: null,
    servings: 40,
    calculationSnapshot: {
      version: 1,
      kind: "direct_dish",
      recipeLineQuantity: quantity,
      wasteFactor: 1,
      batchMultiplier: 1,
      servings: 40,
      yieldQuantity: 1,
      resultQuantity: quantity,
      resultUnit: "pound",
      componentPath: [],
    },
    purchasable: true,
  }) as Contribution;

const report = eventFoodCost({
  contributions: [contribution("butter", 20), contribution("saffron", 4)],
  unresolvedItems: 0,
  ingredients: new Map([
    [
      "butter",
      {
        id: "butter",
        name: "Butter",
        unit: "pound",
        costPerUnit: 4,
        observations: [
          {
            id: "r1",
            ingredientId: "butter",
            vendorId: "v1",
            vendorOrderId: "o1",
            unit: "pound",
            unitPrice: 5,
            observedAt: Date.UTC(2026, 8, 1),
          },
        ],
      },
    ],
    [
      "saffron",
      { id: "saffron", name: "Saffron", unit: "pound", costPerUnit: 0 },
    ],
  ]),
  mappings: [],
  asOf: Date.UTC(2026, 8, 20),
  expectedHeadcount: 40,
  revenue: { amount: 4500, source: "closeout" },
  actual: { ingredientCost: 800, actualHeadcount: 38, finalized: true },
  recordedWasteCost: 8,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.report = report;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("event food-cost panel", () => {
  it("shows an incomplete estimate as 'at least' with its gap, beside purchases plus waste", () => {
    act(() =>
      root.render(createElement(EventFoodCostPanel, { eventId: "ev-1" })),
    );
    const text = container.textContent ?? "";
    // 20 lb butter at the $5 receipt price; saffron is $0 so not counted.
    expect(text).toContain("at least $100");
    expect(text).toContain(
      "Food cost is not complete: 1 ingredient amount has no price.",
    );
    expect(text).toContain("$808");
    expect(text).toContain("$800 bought + $8 wasted");
    expect(text).toContain("Food cost % uses closeout revenue");
    // No food-cost % is claimed for an incomplete estimate.
    expect(text).toContain("— of revenue");
    expect(text).toContain("Not priced: price is $0");
    expect(text).toContain("Receipt price from");
    expect(text).not.toMatch(/priced at \$0|incompatible|undefined|null/);
  });

  it("renders nothing for a role that may not read food cost", () => {
    act(() =>
      root.render(
        createElement(EventFoodCostPanel, { eventId: "ev-1", enabled: false }),
      ),
    );
    expect(container.textContent).toBe("");
  });
});
