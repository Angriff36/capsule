import { describe, expect, it } from "vitest";
import { buildMenuProfitability } from "../src/features/kitchen/MenuProfitabilityAnalysis";

describe("per-guest menu margin", () => {
  it("waits for every dish's cost before showing a margin", () => {
    const analysis = buildMenuProfitability({
      menuDishes: [
        { id: "md1", version: 1, menuId: "m1", dishId: "d1", sortOrder: 0 },
      ],
      dishes: [{ id: "d1", name: "Uncosted dish" }],
      dishComponents: [],
      components: [],
      dishIngredients: [],
      componentIngredients: [],
      ingredients: [],
      priceObservations: [],
      menuPricePerPerson: 100,
    } as never);
    expect(analysis.perGuestMenu).toBe(true);
    expect(analysis.portfolioMarginPercent).toBeNull();
  });
});
