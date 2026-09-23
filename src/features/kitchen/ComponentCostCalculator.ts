import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";
import {
  QuantityMoney,
  type RecordedUnitMapping,
} from "../../lib/quantityMoney";

export type ComponentCostLineStatus =
  "priced" | "missing_ingredient" | "missing_price" | "incompatible_unit";

export interface ComponentCostLineInput {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
}

export interface ComponentCostIngredientInput {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  costPerUnit: number;
}

export interface ComponentCostLineResult {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  lineQuantity: number;
  lineUnit: UnitOfMeasure;
  pricingUnit?: UnitOfMeasure;
  costPerPricingUnit?: number;
  quantityInPricingUnits?: number;
  extendedCost?: number;
  status: ComponentCostLineStatus;
}

export interface ComponentCostSummary {
  batchCost: number;
  costPerYieldUnit: number | null;
  pricedLineCount: number;
  totalLineCount: number;
  incompleteLineCount: number;
  isComplete: boolean;
  lines: ComponentCostLineResult[];
}

export interface CalculateComponentCostInput {
  lines: ComponentCostLineInput[];
  ingredients: ComponentCostIngredientInput[];
  batchMultiplier: number;
  yieldQuantity: number;
  mappings?: readonly RecordedUnitMapping[];
}

/**
 * Thin wrapper around `QuantityMoney.convert`: refuses unmapped count,
 * cross-dimension and density conversions instead of defaulting. With no
 * mappings the behavior matches the old same-dimension-only table
 * (`fluid_ounce` included), so the 3-arg call keeps working.
 */
export function convertComponentQuantity(
  quantity: number,
  fromUnit: UnitOfMeasure,
  toUnit: UnitOfMeasure,
  mappings?: readonly RecordedUnitMapping[],
  ingredientId?: string,
): number | null {
  const result = new QuantityMoney().convert({
    quantity,
    from: fromUnit,
    to: toUnit,
    mappings,
    ingredientId,
  });
  return result.status === "resolved" ? result.quantity : null;
}

export function calculateComponentCost({
  lines,
  ingredients,
  batchMultiplier,
  yieldQuantity,
  mappings,
}: CalculateComponentCostInput): ComponentCostSummary {
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const multiplier =
    Number.isFinite(batchMultiplier) && batchMultiplier > 0
      ? batchMultiplier
      : 0;

  const costLines = lines.map<ComponentCostLineResult>((line) => {
    const ingredient = ingredientsById.get(line.ingredientId);
    const base = {
      lineId: line.id,
      ingredientId: line.ingredientId,
      ingredientName: ingredient?.name ?? "Unavailable ingredient",
      lineQuantity: line.quantity,
      lineUnit: line.unit,
    };

    if (!ingredient) {
      return { ...base, status: "missing_ingredient" };
    }

    const costPerUnit = Number(ingredient.costPerUnit);
    if (!Number.isFinite(costPerUnit) || costPerUnit <= 0) {
      return {
        ...base,
        pricingUnit: ingredient.unit,
        costPerPricingUnit: costPerUnit,
        status: "missing_price",
      };
    }

    const quantityInPricingUnits = convertComponentQuantity(
      Number(line.quantity),
      line.unit,
      ingredient.unit,
      mappings,
      line.ingredientId,
    );
    if (quantityInPricingUnits === null) {
      return {
        ...base,
        pricingUnit: ingredient.unit,
        costPerPricingUnit: costPerUnit,
        status: "incompatible_unit",
      };
    }

    const extendedCost = new QuantityMoney().lineCost({
      quantity: quantityInPricingUnits * multiplier,
      costPerUnit,
    });
    if (extendedCost === null) {
      return {
        ...base,
        pricingUnit: ingredient.unit,
        costPerPricingUnit: costPerUnit,
        quantityInPricingUnits,
        status: "missing_price",
      };
    }

    return {
      ...base,
      pricingUnit: ingredient.unit,
      costPerPricingUnit: costPerUnit,
      quantityInPricingUnits,
      extendedCost,
      status: "priced",
    };
  });

  const batchCost = costLines.reduce(
    (total, line) => total + (line.extendedCost ?? 0),
    0,
  );
  const pricedLineCount = costLines.filter(
    (line) => line.status === "priced",
  ).length;
  const incompleteLineCount = costLines.length - pricedLineCount;

  return {
    batchCost,
    costPerYieldUnit:
      Number.isFinite(yieldQuantity) && yieldQuantity > 0
        ? batchCost / yieldQuantity
        : null,
    pricedLineCount,
    totalLineCount: costLines.length,
    incompleteLineCount,
    isComplete: new QuantityMoney().isCompleteCoverage({
      pricedLineCount,
      incompleteLineCount,
    }),
    lines: costLines,
  };
}
