/**
 * #274: TPP's "Shopping List By: Vendor" workbook reads as an order list.
 * Layout copied from a real export (items made up): header labels one column
 * later than the order list CSV, "(Unassigned)" / bare / "(Continued...)"
 * vendor headings, an amount in the stock number column when the item has no
 * stock number, a "Printed Date" footer, and an Excel day number for the date.
 */
import { describe, expect, it } from "vitest";
import { parseRowReport } from "../src/lib/tppReports/csvReports";

const blank = ["", "", "", "", "", "", "", "", "", "", ""];
const columns = [
  "Inventory",
  "Stock #",
  "",
  "Purchase Units Needed",
  "",
  "",
  "- OR -",
  "",
  "Shelf Units Needed",
  "",
  "",
];
const line = (name: string, b: string, d: string, g: string) => [
  name,
  b,
  "",
  d,
  "",
  "",
  g,
  "",
  "",
  "",
  "",
];
const one = (text: string) => [text, ...blank.slice(1)];

const rows: string[][] = [
  one("Shopping List By: Vendor"),
  blank,
  [
    "Event Date",
    "Invoice #",
    "Status",
    "",
    "Guest Count",
    "Contact",
    "",
    "",
    "",
    "",
    "",
  ],
  ["46270", "6014", "3- Final", "", "167", "Pat Planner", "", "", "", "", ""],
  one("(Unassigned)"),
  columns,
  line("Sesame Seeds ***", "0.16 Pound", "", "0.16 Pound"),
  line("White Pepper", "57.373875", "", "57.373875"),
  one("Food Supplier"),
  columns,
  line("Whole Milk", "4429207", "1.05 Case", "2.09 Gallon"),
  [
    "Printed Date: 9/4/2026 2:33 ",
    "Page 2 of 3",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  one("Food Supplier (Continued...)"),
  columns,
  line("Cheese", "123", "4.18 Pound", "4.18 Pound"),
];

describe("TPP Shopping List workbook", () => {
  it("reads header, vendors and lines without guessing units", () => {
    const part = parseRowReport(rows);
    expect(part?.source).toBe("orderList");
    expect(part?.header).toEqual({
      invoiceNumber: "6014",
      eventDate: "2026-09-05",
      status: "3- Final",
      guestCount: 167,
    });
    expect(part?.client).toEqual({ name: "Pat Planner" });
    expect(part?.orderLines).toEqual([
      {
        vendor: "Unassigned",
        inventoryItem: "Sesame Seeds ***",
        orderQuantity: 0.16,
        orderUnit: "Pound",
      },
      {
        vendor: "Unassigned",
        inventoryItem: "White Pepper",
        orderQuantity: 57.373875,
      },
      {
        vendor: "Food Supplier",
        inventoryItem: "Whole Milk",
        stockNumber: "4429207",
        orderQuantity: 2.09,
        orderUnit: "Gallon",
        purchaseQuantity: 1.05,
        purchaseUnit: "Case",
      },
      {
        vendor: "Food Supplier",
        inventoryItem: "Cheese",
        stockNumber: "123",
        orderQuantity: 4.18,
        orderUnit: "Pound",
        purchaseQuantity: 4.18,
        purchaseUnit: "Pound",
      },
    ]);
  });
});
