import { describe, expect, it } from "vitest";
import { catalogUnitForStockLine } from "../src/features/inventory/stockLevels";

const kilogramCatalog = [{ _id: "ing1", unit: "kilogram" }];

describe("existing stock rows paint the catalog unit, not a stale each", () => {
  it("Heirloom Tomato stored as each still labels kilogram", () => {
    expect(
      catalogUnitForStockLine(
        { ingredientId: "ing1", unit: "each" },
        kilogramCatalog,
      ),
    ).toBe("kilogram");
    expect(
      catalogUnitForStockLine(
        { ingredientId: "ing1", unit: "each" },
        kilogramCatalog,
      ),
    ).not.toBe("each");
  });

  it("falls back to the stored unit when the ingredient is missing", () => {
    expect(
      catalogUnitForStockLine({ ingredientId: "gone", unit: "each" }, []),
    ).toBe("each");
  });
});
