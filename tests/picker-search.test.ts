import { describe, expect, it } from "vitest";
import { rankBySearch } from "../src/ui/pickerSearch";

const rows = [
  "Cambro Hot Water Dispenser (filled) - Hand Washing",
  "Chicken Breast, Boneless Skinless",
  "Chafing Dish Full Size",
];
const find = (query: string) =>
  rankBySearch(rows, query, (row) => ({ label: row }));

describe("picker search", () => {
  it("still finds a word from its letters in order", () => {
    expect(find("chkn")).toEqual(["Chicken Breast, Boneless Skinless"]);
  });

  it("does not match letters spread across a whole name", () => {
    expect(find("chafing")).toEqual(["Chafing Dish Full Size"]);
  });
});
