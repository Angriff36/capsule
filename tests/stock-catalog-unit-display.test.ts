import { readFileSync } from "node:fs";
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

  it("stock book, inventory overview, and home alerts use the helper", () => {
    const book = readFileSync(
      "src/features/inventory/StockBookPage.tsx",
      "utf8",
    );
    const overview = readFileSync(
      "src/features/inventory/InventoryOverviewPage.tsx",
      "utf8",
    );
    const home = readFileSync(
      "src/features/home/DashboardWidgetPolicy.ts",
      "utf8",
    );
    expect(book).toContain("catalogUnitForStockLine");
    expect(book).toContain("unitFor(item)");
    expect(book).not.toContain("<small>{item.unit}</small>");
    expect(overview).toContain(
      "catalogUnitForStockLine(item, ingredients ?? [])",
    );
    expect(home).toContain("catalogUnitForStockLine(item, facts.ingredients)");
  });
});
