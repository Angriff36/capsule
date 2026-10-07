/**
 * The old system's Inventory In-Stock report (PL-SOURCE-DATASETS, AC-057
 * "equipment references"): only its groups of tools come in as equipment;
 * food, disposables, prep steps and bought lines inside a tool group are left
 * out, counted per group with the reason. The sample keeps the real report's
 * layout: title lines, group name, heading row, lines, page footer.
 */
import { describe, expect, it } from "vitest";
import {
  TPP_INVENTORY_COLUMNS,
  isTppInventoryReport,
  readTppInventoryList,
  tppEquipmentCategory,
  tppEquipmentTag,
} from "../src/lib/tppInventoryList";

const HEADING = [
  "Inventory Item",
  "",
  "",
  "Stock #",
  "",
  "Vendor",
  "",
  "In Stock*",
  "Unit Value",
  "Storage Location",
  "Total Value",
  "",
  "Last Updated",
  "",
];

const line = (
  name: string,
  inStock: string,
  more: { stock?: string; vendor?: string; unit?: string; place?: string } = {},
) => [
  name,
  "",
  "",
  more.stock ?? "",
  "",
  more.vendor ?? "",
  "",
  inStock,
  more.unit ?? "0",
  more.place ?? "",
  "0",
  "",
  "43920.9",
  "",
];

const SAMPLE_GRID: string[][] = [
  ["Inventory In-Stock"],
  ["Sort Order:", "Inventory Name"],
  ["As of Date:"],
  ["9/4/2026"],
  ["(DAY OF) Chef Pack Based On Need"],
  HEADING,
  line("Bread  Knife", "2", { place: "Kitchen" }),
  line("RICE, WHITE LONG GRAIN", "0", { stock: "1234567", unit: "0.5" }),
  ["Printed Date:", "9/4/2026", "Page", "1", "of 73"],
  line("Tongs - Kitchen", "10", { place: "Kitchen" }),
  ["(DAY OF) Must Pack BOH Items"],
  HEADING,
  line("|D12| Stir Sticks in\nContainer", "0", { place: "Warehouse" }),
  line("Kitchen Mat", "8", { vendor: "Mangia" }),
  ["2. CHECK ITEMS IN TRAILER"],
  HEADING,
  line("Fire Extinguisher", "0", { place: "Back Trailer \nParking" }),
  ["Cold Food"],
  HEADING,
  line("Anchovies", "0", { stock: "1333780", unit: "0.7", place: "Walk In" }),
  line("Airline Chicken", "0", { place: "Walk In" }),
  ["Drop Off Servingware"],
  HEADING,
  line("Disposable Chafer Base", "0"),
  ["Prep List Item"],
  HEADING,
  line("Portion Asian Slaw", "0"),
];

describe("old-system Inventory In-Stock report", () => {
  it("is told apart from the Goodshuffle export", () => {
    expect(isTppInventoryReport(SAMPLE_GRID)).toBe(true);
    expect(isTppInventoryReport([["Product ID", "Title"]])).toBe(false);
  });

  it("brings in tool lines and counts every left-out line with its reason", () => {
    const { rows, leftOut } = readTppInventoryList(SAMPLE_GRID);
    expect(rows.map((row) => row.name)).toEqual([
      "Bread Knife",
      "Tongs - Kitchen",
      "Stir Sticks in Container",
      "Kitchen Mat",
      "Fire Extinguisher",
    ]);
    expect(rows[0]).toMatchObject({
      group: "(DAY OF) Chef Pack Based On Need",
      inStock: 2,
      storage: "Kitchen",
      lastUpdated: "2020-03-30",
    });
    expect(rows[2]).toMatchObject({ bin: "D12", storage: "Warehouse" });
    expect(rows[3]).toMatchObject({ vendor: "Mangia", inStock: 8 });
    expect(rows[4]).toMatchObject({ storage: "Back Trailer Parking" });

    expect(leftOut).toEqual([
      {
        group: "(DAY OF) Chef Pack Based On Need",
        count: 1,
        reason: expect.stringMatching(/^Bought food/),
      },
      { group: "Cold Food", count: 2, reason: expect.stringMatching(/^Food/) },
      {
        group: "Drop Off Servingware",
        count: 1,
        reason: expect.stringMatching(/^Disposables/),
      },
      {
        group: "Prep List Item",
        count: 1,
        reason: expect.stringMatching(/^Prep steps/),
      },
    ]);
  });

  it("gives each line a stable tag and a category, and names every column", () => {
    expect(tppEquipmentTag("Tongs - Kitchen")).toBe("TPP-tongs-kitchen");
    expect(tppEquipmentTag("  tongs -  KITCHEN ")).toBe("TPP-tongs-kitchen");
    expect(tppEquipmentCategory("2. CHECK ITEMS IN TRAILER")).toBe("Site");
    expect(tppEquipmentCategory("(DAY OF) Must Pack BOH Items")).toBe(
      "Cooking",
    );
    const named = TPP_INVENTORY_COLUMNS.map((c) => c.column).join(" | ");
    for (const heading of HEADING.filter(Boolean))
      expect(named).toContain(heading);
  });
});
