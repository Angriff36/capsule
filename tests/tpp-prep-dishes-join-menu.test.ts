import { describe, expect, it } from "vitest";
import { mergeEventBundle } from "../src/lib/tppReports/mergeEventBundle";

describe("TPP import: production worksheet dishes join the menu", () => {
  it("adds each prep dish missing from the menu once, with its servings", () => {
    const bundle = mergeEventBundle([
      {
        source: "productionWorksheet",
        prepTasks: [
          {
            category: "Finish at Kitchen",
            dishName: "Asian Slaw (Sel)",
            name: "Portion Lettuce",
            quantity: 4,
            unit: "lb",
            parentServings: 120,
          },
          {
            category: "Finish at Kitchen",
            dishName: "Asian Slaw (Sel)",
            name: "Portion Wonton Strips",
            quantity: 2,
            unit: "lb",
            parentServings: 120,
          },
          {
            category: "Finish at Kitchen",
            dishName: "Grilled Chicken Teriyaki (Sel)",
            name: "Grill Chicken",
            quantity: 30,
            unit: "lb",
            parentServings: 80,
          },
        ],
      },
    ]);
    expect(
      bundle.menu.map((item) => [item.name, item.quantityServings]),
    ).toEqual([
      ["Asian Slaw (Sel)", 120],
      ["Grilled Chicken Teriyaki (Sel)", 80],
    ]);
    expect(bundle.warnings).not.toContain(
      "No menu items were found in any report.",
    );
  });

  it("does not add a dish the menu already has under another bracket tag", () => {
    const bundle = mergeEventBundle([
      { source: "beo", menu: [{ name: "Asian Slaw", quantityServings: 100 }] },
      {
        source: "productionWorksheet",
        prepTasks: [
          {
            category: "Finish at Kitchen",
            dishName: "Asian Slaw (Sel)",
            name: "Portion Lettuce",
            quantity: 4,
            unit: "lb",
            parentServings: 120,
          },
        ],
      },
    ]);
    expect(bundle.menu.map((item) => item.name)).toEqual(["Asian Slaw"]);
  });
});
