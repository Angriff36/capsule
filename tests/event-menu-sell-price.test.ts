import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  eventMenuSellTotals,
  formatSellPriceInstruction,
  parseUnitSellPrice,
} from "../src/features/events/eventMenuSellPrice";
import {
  suspectPrepQuantityFlag,
  suspectRowsFromRecipeLines,
} from "../src/features/events/eventMenuSuspectQuantity";
import { EventPrepCoordinator } from "../src/features/kitchen/EventPrepCoordinator";
import {
  TPP_INVOICE,
  TPP_SELL_LINES,
  tppFoodSellTotal,
} from "../scripts/tpp-mendenhall-jarvis-catalog";

describe("event menu sell prices", () => {
  it("parses SELL:34.00 from specialInstructions", () => {
    expect(parseUnitSellPrice("SELL:34.00")).toBe(34);
    expect(parseUnitSellPrice("notes\nSELL:4.95")).toBe(4.95);
    expect(parseUnitSellPrice("no price")).toBeNull();
  });

  it("rolls the TPP invoice food sell total from encoded unit prices", () => {
    const rollup = eventMenuSellTotals(
      TPP_SELL_LINES.map((line, index) => ({
        eventDishId: `ed-${index}`,
        dishId: `dish-${index}`,
        name: line.name,
        servings: line.servings,
        specialInstructions: formatSellPriceInstruction(line.unitSell),
      })),
    );
    expect(tppFoodSellTotal()).toBeCloseTo(TPP_INVOICE.foodSubtotal);
    expect(rollup.foodSellTotal).toBeCloseTo(4160.1);
    expect(
      rollup.lines.find((line) => line.name === "Menu Experience")?.sellTotal,
    ).toBe(3332);
    expect(
      rollup.lines.find((line) => line.name === "Guacamole and Salsa Bar")
        ?.sellTotal,
    ).toBeCloseTo(485.1);
  });
});

describe("suspect TPP quantities", () => {
  it("keeps 196 lb sliced radish and flags it", () => {
    const flag = suspectPrepQuantityFlag({
      name: "Sliced radish",
      unit: "pound",
      quantity: 196,
      servings: 98,
    });
    expect(flag).toMatch(/196/);
    expect(flag).toMatch(/not converted/i);
    expect(
      suspectPrepQuantityFlag({
        name: "Lettuce",
        unit: "pound",
        quantity: 4.59,
        servings: 98,
      }),
    ).toBeNull();
  });

  it("flags Garnish kit recipe lines after template sync keeps 196 lb", async () => {
    const created: Array<{
      name: string;
      quantity: number;
      unit: string;
    }> = [];
    const coordinator = new EventPrepCoordinator({
      createTask: async (input) => {
        created.push({
          name: input.name,
          quantity: input.quantity,
          unit: input.unit,
        });
        return { docId: `prep-${created.length}` };
      },
    });

    const recipeLines = [
      { name: "Garnish kit", quantity: 1, unit: "each" as const },
      {
        name: "Sliced radish",
        quantity: 2,
        unit: "pound" as const,
        suspect: true,
      },
      { name: "Cilantro", quantity: 0.5, unit: "pound" as const },
    ];

    await coordinator.sync({
      eventDish: {
        id: "ed-garnish",
        eventId: "event-tpp",
        dishId: "dish-garnish",
        quantityServings: 98,
      },
      templates: [
        {
          id: "dt-garnish",
          dishId: "dish-garnish",
          name: "Garnish kit",
          defaultQuantity: 1,
          defaultUnit: "each",
          status: "active",
        },
      ],
      tasks: [],
      demands: [],
      skipDemand: true,
      dishIngredients: recipeLines.map((line, index) => ({
        id: `line-${index}`,
        dishId: "dish-garnish",
        ingredientId: `ing-${index}`,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
      })),
    });

    expect(created).toEqual([
      { name: "Garnish kit", quantity: 98, unit: "each" },
    ]);
    expect(
      suspectPrepQuantityFlag({
        name: created[0]!.name,
        unit: created[0]!.unit,
        quantity: created[0]!.quantity,
        servings: 98,
      }),
    ).toBeNull();

    const rows = suspectRowsFromRecipeLines(recipeLines, 98);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(196);
    expect(rows[0]?.unit).toMatch(/pound|lb/i);
    expect(rows[0]?.flag).toMatch(/196/);
    expect(rows[0]?.flag).toMatch(/not converted/i);
  });

  it("flags a recipe line marked suspect: true even when the name is Garnish kit", () => {
    const rows = suspectRowsFromRecipeLines(
      [
        {
          name: "Garnish kit",
          quantity: 2,
          unit: "pound",
          suspect: true,
        },
      ],
      98,
    );
    expect(rows[0]?.quantity).toBe(196);
    expect(rows[0]?.flag).toMatch(/196/);
  });

  it("menu card and prep tab flag from recipe lines, not only task.name", () => {
    const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
    const prep = readFileSync("src/features/events/EventPrepTab.tsx", "utf8");
    expect(tab).toContain("suspectRowsFromRecipeLines");
    expect(tab).toContain('data-testid="suspect-prep-quantity"');
    expect(prep).toContain("suspectRowsFromRecipeLines");
    expect(prep).toContain("dishIngredients");
    expect(prep).toContain('data-testid="suspect-prep-quantity"');
  });
});
