const SELL_PREFIX = "SELL:";

export type EventMenuSellLine = {
  eventDishId: string;
  dishId: string;
  name: string;
  servings: number;
  unitSellPrice: number | null;
  sellTotal: number;
};

export type EventMenuSellRollup = {
  lines: EventMenuSellLine[];
  foodSellTotal: number;
};

/** Parse a unit sell price encoded as `SELL:34.00` in EventDish.specialInstructions. */
export function parseUnitSellPrice(
  specialInstructions?: string | null,
): number | null {
  if (!specialInstructions) return null;
  const match = specialInstructions.match(/(?:^|\n)SELL:(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatSellPriceInstruction(
  unitSellPrice: number,
  rest?: string | null,
): string {
  const body = String(rest ?? "")
    .replace(/(?:^|\n)SELL:-?\d+(?:\.\d+)?\n?/g, "")
    .trim();
  const encoded = `${SELL_PREFIX}${unitSellPrice.toFixed(2)}`;
  return body ? `${encoded}\n${body}` : encoded;
}

export function eventMenuSellTotals(
  lines: readonly {
    eventDishId: string;
    dishId: string;
    name: string;
    servings: number;
    specialInstructions?: string | null;
  }[],
): EventMenuSellRollup {
  const priced = lines.map((line) => {
    const unitSellPrice = parseUnitSellPrice(line.specialInstructions);
    const servings = Number(line.servings);
    const guests = Number.isFinite(servings) && servings > 0 ? servings : 0;
    return {
      eventDishId: line.eventDishId,
      dishId: line.dishId,
      name: line.name,
      servings: guests,
      unitSellPrice,
      sellTotal:
        unitSellPrice != null ? Number((unitSellPrice * guests).toFixed(2)) : 0,
    };
  });
  return {
    lines: priced,
    foodSellTotal: Number(
      priced.reduce((sum, line) => sum + line.sellTotal, 0).toFixed(2),
    ),
  };
}
