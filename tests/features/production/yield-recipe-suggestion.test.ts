// @vitest-environment jsdom
/**
 * PL-REPLACEMENT-PROOF (Galley): repeated actual yields suggest a recipe
 * yield to check. No suggestion for too few batches, normal spread, or a
 * batch unit that differs from the recipe's unit.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProductionYieldDashboard } from "../../../src/features/production/ProductionYieldDashboardPage";
import {
  buildProductionYieldReport,
  type ProductionYieldBatch,
} from "../../../src/features/production/productionYield";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date("2026-10-03T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function batches(
  componentId: string,
  rows: [planned: number, actual: number][],
  yieldUnit = "portion",
): ProductionYieldBatch[] {
  return rows.map(([plannedYield, actualYield], index) => ({
    _id: `${componentId}-${index}`,
    componentId,
    status: "completed",
    plannedYield,
    actualYield,
    yieldUnit,
    completedAt: now.getTime() - (index + 1) * day,
  }));
}

const components = [
  {
    _id: "short",
    name: "Braised short rib",
    yieldQuantity: 20,
    yieldUnit: "portion",
  },
  {
    _id: "steady",
    name: "Rice pilaf",
    yieldQuantity: 40,
    yieldUnit: "portion",
  },
  { _id: "few", name: "Gravy", yieldQuantity: 10, yieldUnit: "portion" },
  { _id: "other", name: "Stock", yieldQuantity: 8, yieldUnit: "quart" },
];

const allBatches = [
  ...batches("short", [
    [20, 17],
    [40, 34],
    [20, 17],
  ]),
  ...batches("steady", [
    [40, 39],
    [40, 41],
    [40, 39],
  ]),
  ...batches("few", [
    [10, 7],
    [10, 7],
  ]),
  ...batches(
    "other",
    [
      [8, 6],
      [8, 6],
      [8, 6],
    ],
    "gallon",
  ),
];

describe("recipe yield suggestion", () => {
  it("suggests only where enough same-unit batches miss past normal spread", () => {
    const report = buildProductionYieldReport({
      batches: allBatches,
      components,
      windowDays: 30,
      now,
    });
    const byId = new Map(report.rows.map((row) => [row.componentId, row]));
    expect(byId.get("short")?.suggestion).toEqual({
      currentYield: 20,
      suggestedYield: 17,
      yieldUnit: "portion",
    });
    expect(byId.get("steady")?.suggestion).toBeNull();
    expect(byId.get("few")?.suggestion).toBeNull();
    expect(byId.get("other")?.suggestion).toBeNull();
  });

  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the suggestion with a link to the recipe", () => {
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(ProductionYieldDashboard, {
            batches: allBatches,
            components,
            now,
          }),
        ),
      );
    });
    const links = container.querySelectorAll<HTMLAnchorElement>(
      '[data-testid="yield-suggestion"]',
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/kitchen/components/short");
    expect(links[0]?.textContent).toContain("Recipe says 20 portion");
    expect(links[0]?.textContent).toContain("suggest 17");
  });
});
