/**
 * AC-076 (spec PR04-02): missing units, units that do not convert to the
 * catalog unit, clashing counts and unchecked counts stay open on their own
 * record. None of them becomes zero on hand, "each" or a guessed conversion.
 * The persisted side (nothing reaches on-hand until a person applies a ready
 * record) is proven in tests/proofs/stock-import-opening.runtime.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  clashingKeys,
  draftFromRow,
  evaluateOpeningStock,
  readOpeningStockRow,
  unitFromText,
  withClash,
  type OpeningStockCatalog,
} from "../../../src/lib/openingStock";

const catalog: OpeningStockCatalog = {
  ingredients: [
    { id: "ing-flour", name: "Flour", unit: "pound" },
    { id: "ing-cream", name: "Heavy cream", unit: "quart" },
    { id: "ing-lemons", name: "Lemons", unit: "each" },
    { id: "ing-oil", name: "Olive oil", unit: "liter" },
  ],
  components: [],
  locations: [{ id: "loc-dry", name: "Dry storage" }],
  mappings: [
    // One case of lemons is 12 lemons, recorded on the item.
    {
      ingredientId: "ing-lemons",
      kind: "pack",
      unit: "case",
      equalsQuantity: 12,
      equalsUnit: "each",
    },
  ],
};

const row = (fields: Record<string, unknown>) => {
  const read = readOpeningStockRow({
    Type: "Food",
    Location: "Dry storage",
    "As of": "2026-09-01",
    Counted: "yes",
    ...fields,
  });
  if (!read) throw new Error("row not read");
  return draftFromRow(read, catalog);
};

describe("stock import resolution (AC-076)", () => {
  it("a stock row with an unmapped or conflicting unit is held per record for resolution and never materializes as 0 on-hand or each", () => {
    // Missing unit: stays missing, never "each".
    const noUnit = row({ Item: "Flour", Qty: "40" });
    expect(noUnit.unit).toBeNull();
    const noUnitCheck = evaluateOpeningStock(noUnit, catalog);
    expect(noUnitCheck.issues).toContain("missing_unit");
    expect(noUnitCheck.catalogQuantity).toBeNull();

    // Unknown unit text is kept as the source and flagged.
    const oddUnit = row({ Item: "Flour", Qty: "2", Unit: "sacks" });
    expect(oddUnit.unit).toBeNull();
    expect(oddUnit.sourceUnit).toBe("sacks");
    expect(evaluateOpeningStock(oddUnit, catalog).issues).toContain(
      "unknown_unit",
    );

    // Counted in a measure that does not convert to the catalog unit.
    const volumeFlour = row({ Item: "Flour", Qty: "3", Unit: "cups" });
    const volumeCheck = evaluateOpeningStock(volumeFlour, catalog);
    expect(volumeCheck.issues).toContain("unit_incompatible");
    expect(volumeCheck.catalogQuantity).toBeNull();

    // A count unit with no pack size on the item: no guessed conversion.
    const caseCream = row({ Item: "Heavy cream", Qty: "2", Unit: "case" });
    const caseCheck = evaluateOpeningStock(caseCream, catalog);
    expect(caseCheck.issues).toContain("unit_incompatible");
    expect(caseCheck.catalogQuantity).toBeNull();

    // A count unit WITH a recorded pack size converts exactly.
    const caseLemons = row({ Item: "Lemons", Qty: "2", Unit: "cs" });
    const lemonCheck = evaluateOpeningStock(caseLemons, catalog);
    expect(lemonCheck.issues).toEqual([]);
    expect(lemonCheck.catalogQuantity).toBe(24);

    // Same measure converts exactly: 64 oz of flour = 4 lb.
    const ounces = evaluateOpeningStock(
      row({ Item: "Flour", Qty: "64", Unit: "oz" }),
      catalog,
    );
    expect(ounces.issues).toEqual([]);
    expect(ounces.catalogQuantity).toBe(4);

    // A blank amount is missing, never zero.
    const blank = row({ Item: "Olive oil", Qty: "", Unit: "L" });
    expect(blank.quantity).toBeNull();
    const blankCheck = evaluateOpeningStock(blank, catalog);
    expect(blankCheck.issues).toContain("missing_quantity");
    expect(blankCheck.catalogQuantity).toBeNull();
  });

  it("an unchecked count stays open until a person confirms it", () => {
    const unchecked = row({
      Item: "Olive oil",
      Qty: "6",
      Unit: "L",
      Counted: "no",
    });
    expect(unchecked.countState).toBe("unverified");
    expect(evaluateOpeningStock(unchecked, catalog).issues).toEqual([
      "unverified_count",
    ]);
    const estimate = row({
      Item: "Olive oil",
      Qty: "6",
      Unit: "L",
      Counted: "estimate",
    });
    expect(estimate.countState).toBe("estimated");
    expect(evaluateOpeningStock(estimate, catalog).issues).toContain(
      "unverified_count",
    );
    const confirmed = { ...unchecked, countState: "counted" as const };
    expect(evaluateOpeningStock(confirmed, catalog).issues).toEqual([]);
  });

  it("two counts of one item in one place on one day with different amounts clash; other days do not", () => {
    const first = row({ Item: "Flour", Qty: "40", Unit: "lb" });
    const second = row({ Item: "Flour", Qty: "38", Unit: "lb" });
    const sameAmountOtherUnit = row({ Item: "Flour", Qty: "640", Unit: "oz" });
    const nextWeek = row({
      Item: "Flour",
      Qty: "12",
      Unit: "lb",
      "As of": "2026-09-08",
    });
    const records = [first, second, sameAmountOtherUnit, nextWeek].map(
      (draft, index) => ({
        key: `r${index}`,
        draft,
        catalogQuantity: evaluateOpeningStock(draft, catalog).catalogQuantity,
      }),
    );
    const clashing = clashingKeys(records);
    expect([...clashing].sort()).toEqual(["r0", "r1", "r2"]);
    expect(withClash([], clashing.has("r3"))).toEqual([]);

    // Once the wrong count is gone, the rest agree (40 lb = 640 oz).
    const settled = clashingKeys([records[0], records[2], records[3]]);
    expect(settled.size).toBe(0);
  });

  it("one SKU counted in two locations is two rows, not one", () => {
    const walkIn = readOpeningStockRow({
      Name: "Butter",
      SKU: "B-1",
      Qty: "4",
      Location: "Walk-in",
    });
    const dry = readOpeningStockRow({
      Name: "Butter",
      SKU: "B-1",
      Qty: "2",
      Location: "Dry storage",
    });
    expect(walkIn!.sourceRow).not.toBe(dry!.sourceRow);
    const again = readOpeningStockRow({
      Name: "Butter",
      SKU: "B-1",
      Qty: "5",
      Location: "Walk-in",
    });
    expect(again!.sourceRow).toBe(walkIn!.sourceRow);
  });

  it("reads plain unit words the way count sheets write them", () => {
    expect(unitFromText("lbs")).toBe("pound");
    expect(unitFromText("Oz - Fld")).toBe("fluid_ounce");
    expect(unitFromText("cs")).toBe("case");
    expect(unitFromText("")).toBeNull();
    expect(unitFromText("bag")).toBeNull();
  });
});
