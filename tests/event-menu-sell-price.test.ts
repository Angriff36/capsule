import { describe, expect, it } from "vitest";
import {
  eventMenuSellTotals,
  formatSellPriceInstruction,
  parseUnitSellPrice,
} from "../src/features/events/eventMenuSellPrice";
import { suspectPrepQuantityFlag } from "../src/features/events/eventMenuSuspectQuantity";
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
});
