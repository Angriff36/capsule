import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  eventMenuSellTotals,
  formatSellPriceInstruction,
  parseUnitSellPrice,
} from "../src/features/events/eventMenuSellPrice";
import {
  encodeEventMenuLineFields,
  eventMenuLineServings,
  parseEventMenuLineFields,
  planEventMenuLineSave,
  resolveContainerCount,
  resolveUnitSellPrice,
} from "../src/features/events/eventMenuLineFields";
import {
  eventMenuLinePanCount,
  eventMenuPansInputValue,
} from "../src/features/events/eventMenuContainers";
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

describe("first-class event menu line persist", () => {
  it("saves sell price without requiring SELL: in notes", () => {
    const plan = planEventMenuLineSave({
      currentInstructions: "keep extra spicy",
      currentServings: 98,
      nextSellRaw: "34",
      nextServingsRaw: "98",
      nextContainerRaw: "",
    });
    expect(plan.unitSellPrice).toBe(34);
    expect(plan.specialInstructions).not.toMatch(/SELL:/);
    expect(parseUnitSellPrice(plan.specialInstructions)).toBeNull();
    expect(
      resolveUnitSellPrice({ specialInstructions: plan.specialInstructions }),
    ).toBe(34);
    expect(
      eventMenuSellTotals([
        {
          eventDishId: "ed-1",
          dishId: "dish-1",
          name: "Menu Experience",
          servings: 98,
          unitSellPrice: 34,
          specialInstructions: "",
        },
      ]).lines[0]?.unitSellPrice,
    ).toBe(34);
    const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
    expect(tab).toContain("planEventMenuLineSave");
    expect(tab).toContain('name="unitSellPrice"');
    expect(tab).toContain('data-testid="event-menu-unit-sell-price"');
    expect(tab).not.toContain("formatSellPriceInstruction");
  });

  it("persists $0 lemonade as a first-class sell price", () => {
    const plan = planEventMenuLineSave({
      currentInstructions: "",
      currentServings: 98,
      nextSellRaw: "0",
      nextServingsRaw: "98",
      nextContainerRaw: "",
    });
    expect(plan.unitSellPrice).toBe(0);
    expect(plan.specialInstructions).not.toMatch(/SELL:/);
    expect(
      parseEventMenuLineFields(plan.specialInstructions).unitSellPrice,
    ).toBe(0);
    expect(
      eventMenuSellTotals([
        {
          eventDishId: "ed-lemonade",
          dishId: "dish-lemonade",
          name: "Lemonade",
          servings: 98,
          unitSellPrice: 0,
          specialInstructions: "",
        },
      ]).lines[0]?.unitSellPrice,
    ).toBe(0);
  });

  it("persists per-row servings 59 instead of event guest count 98", () => {
    const plan = planEventMenuLineSave({
      currentInstructions: "",
      currentServings: 98,
      nextSellRaw: "",
      nextServingsRaw: "59",
      nextContainerRaw: "",
    });
    expect(plan.quantityServings).toBe(59);
    expect(plan.servingsChanged).toBe(true);
    expect(
      eventMenuLineServings({ quantityServings: 59, expectedHeadcount: 98 }),
    ).toBe(59);
    expect(
      eventMenuLineServings({ quantityServings: 59, expectedHeadcount: 98 }),
    ).not.toBe(98);
    const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
    expect(tab).toContain("useEventDishAdjustServings");
    expect(tab).toContain('name="quantityServings"');
    expect(tab).toContain('data-testid="event-menu-servings"');
    expect(tab).toContain("plan.quantityServings");
  });

  it("persists half-pan / container count on the event menu line", () => {
    const plan = planEventMenuLineSave({
      currentInstructions: "",
      currentServings: 59,
      nextSellRaw: "",
      nextServingsRaw: "59",
      nextContainerRaw: "3",
    });
    expect(plan.containerCount).toBe(3);
    expect(plan.specialInstructions).toMatch(/containerCount":3/);
    expect(
      resolveContainerCount({ specialInstructions: plan.specialInstructions }),
    ).toBe(3);
    expect(
      eventMenuLinePanCount(3, 98, "dish-beans", [
        {
          id: "c1",
          dishId: "dish-beans",
          name: "Half pan",
          servingsPerContainer: 20,
        },
      ]),
    ).toBe(3);
    expect(
      eventMenuLinePanCount(null, 98, "dish-beans", [
        {
          id: "c1",
          dishId: "dish-beans",
          name: "Half pan",
          servingsPerContainer: 20,
        },
      ]),
    ).toBe(5);
    const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
    expect(tab).toContain('name="containerCount"');
    expect(tab).toContain('data-testid="event-menu-line-pans"');
  });

  it("reloads Pans=1 after save when leftover notes already say 1 Half pan", () => {
    expect(parseEventMenuLineFields("1 Half pan").containerCount).toBe(1);
    expect(parseEventMenuLineFields("3 Foil wrap").containerCount).toBe(3);
    expect(
      parseEventMenuLineFields("1 Own vessel - labeled GF").containerCount,
    ).toBe(1);

    const notesOnly = planEventMenuLineSave({
      currentInstructions: "1 Half pan",
      currentServings: 59,
      nextSellRaw: "",
      nextServingsRaw: "59",
      nextContainerRaw: "",
    });
    expect(notesOnly.containerCount).toBe(1);
    expect(notesOnly.specialInstructions).toMatch(/containerCount":1/);
    expect(notesOnly.specialInstructions).toMatch(/Half pan/);
    expect(
      parseEventMenuLineFields(notesOnly.specialInstructions).containerCount,
    ).toBe(1);

    const typed = planEventMenuLineSave({
      currentInstructions: "1 Half pan",
      currentServings: 59,
      nextSellRaw: "",
      nextServingsRaw: "59",
      nextContainerRaw: "1",
    });
    expect(typed.containerCount).toBe(1);
    expect(typed.specialInstructions).toMatch(/containerCount":1/);
    const reloaded = parseEventMenuLineFields(typed.specialInstructions);
    expect(reloaded.containerCount).toBe(1);
    expect(reloaded.notes).toMatch(/Half pan/);
    expect(eventMenuPansInputValue(reloaded.containerCount, 3)).toBe(1);
    expect(eventMenuPansInputValue(null, 3)).toBe(3);

    const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");
    expect(tab).toContain("eventMenuPansInputValue");
    expect(tab).toContain("lineFields.containerCount");
    expect(tab).toContain("linePanCount");
  });

  it("keeps leftover SELL: as a read fallback only", () => {
    expect(resolveUnitSellPrice({ specialInstructions: "SELL:4.95" })).toBe(
      4.95,
    );
    expect(
      resolveUnitSellPrice({
        unitSellPrice: 34,
        specialInstructions: "SELL:4.95",
      }),
    ).toBe(34);
    const encoded = encodeEventMenuLineFields({
      unitSellPrice: 2,
      notes: "SELL:99.00 leftover should be stripped",
    });
    expect(encoded).not.toMatch(/SELL:/);
    expect(parseEventMenuLineFields(encoded).unitSellPrice).toBe(2);
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
