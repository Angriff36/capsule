import { describe, expect, it } from "vitest";
import { suggestCatalogMatches } from "../src/agent/CapsuleEventBundleCatalogMatch";
import { mergeEventBundle } from "../src/lib/tppReports/mergeEventBundle";

const catalog = {
  clients: [],
  venues: [],
  dishes: [
    {
      id: "main",
      name: "Grilled Chicken Teriyaki (SEL)",
      versionLabel: "Finish at Event",
    },
    {
      id: "kitchen",
      name: "Grilled Chicken Teriyaki (SEL)",
      versionLabel: "Finish at Kitchen",
      versionOfId: "main",
    },
    {
      id: "drop",
      name: "Grilled Chicken Teriyaki - drop off",
      versionLabel: "Drop Off",
      versionOfId: "main",
    },
  ],
};

function bundleFor(category: string) {
  return mergeEventBundle([
    {
      source: "productionWorksheet",
      prepTasks: [
        {
          category,
          dishName: "Grilled Chicken Teriyaki (Sel)",
          name: "Grill Chicken",
          quantity: 30,
          unit: "lb",
          parentServings: 80,
        },
      ],
    },
  ]);
}

describe("TPP import picks the dish version the kitchen finishes", () => {
  it("takes the Finish at Kitchen version for a Finish at Kitchen line", () => {
    const match = suggestCatalogMatches(
      bundleFor("Finish at Kitchen"),
      catalog,
    );
    expect(Object.values(match.dishIds)).toEqual(["kitchen"]);
  });

  it("takes the main dish when no version matches the finish", () => {
    const match = suggestCatalogMatches(bundleFor("Bev - Alcohol"), catalog);
    expect(Object.values(match.dishIds)).toEqual(["main"]);
  });
});
