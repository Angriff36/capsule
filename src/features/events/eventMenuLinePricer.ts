import {
  QuantityMoney,
  type RecordedUnitMapping,
} from "../../lib/quantityMoney";

/** Shape of a dish ingredient line needed to price one line. */
type PricedLine = {
  ingredientId: string;
  quantity: number | string;
  unit: string;
  wasteFactor?: number | string | null;
};

type PricedIngredient = {
  unit: string;
  costPerUnit: number | string;
};

export type EventMenuLinePriceResult = {
  extendedCost: number;
  status: "priced" | "missing_price" | "incompatible_unit";
};

/**
 * Prices one recipe line: convert the recipe unit to the stock unit, then
 * `quantity × waste × cost` in integer cents. Unmapped conversions and
 * missing costs refuse — they never price a false $0 line (AC-406).
 */
export class EventMenuLinePricer {
  private readonly money = new QuantityMoney();

  constructor(private readonly unitMappings?: readonly RecordedUnitMapping[]) {}

  price(
    line: PricedLine,
    ingredient: PricedIngredient,
  ): EventMenuLinePriceResult {
    const costPerUnit = Number(ingredient.costPerUnit);
    if (!Number.isFinite(costPerUnit) || costPerUnit <= 0) {
      return { extendedCost: 0, status: "missing_price" };
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { extendedCost: 0, status: "missing_price" };
    }
    const converted = this.money.convert({
      quantity,
      from: String(line.unit),
      to: ingredient.unit,
      mappings: this.unitMappings,
      ingredientId: line.ingredientId,
    });
    if (converted.status !== "resolved") {
      return { extendedCost: 0, status: "incompatible_unit" };
    }
    const extendedCost = this.money.lineCost({
      quantity: converted.quantity,
      waste: line.wasteFactor != null ? Number(line.wasteFactor) : 1,
      costPerUnit,
    });
    if (extendedCost === null) {
      return { extendedCost: 0, status: "missing_price" };
    }
    return { extendedCost, status: "priced" };
  }
}
