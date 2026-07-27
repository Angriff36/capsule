import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";

// The prep-sheet units are opaque labels — nothing converts a melon into an
// each — so each gets its own dimension and only ever matches itself.
type UnitDimension =
  "mass" | "volume" | "count" | "serving" | "batch" | "melon" | "bottle";

const UNIT_FACTORS: Record<
  UnitOfMeasure,
  { dimension: UnitDimension; factor: number }
> = {
  each: { dimension: "count", factor: 1 },
  gram: { dimension: "mass", factor: 1 },
  kilogram: { dimension: "mass", factor: 1_000 },
  ounce: { dimension: "mass", factor: 28.349523125 },
  pound: { dimension: "mass", factor: 453.59237 },
  milliliter: { dimension: "volume", factor: 1 },
  liter: { dimension: "volume", factor: 1_000 },
  teaspoon: { dimension: "volume", factor: 4.92892159375 },
  tablespoon: { dimension: "volume", factor: 14.78676478125 },
  cup: { dimension: "volume", factor: 236.5882365 },
  pint: { dimension: "volume", factor: 473.176473 },
  quart: { dimension: "volume", factor: 946.352946 },
  gallon: { dimension: "volume", factor: 3_785.411784 },
  portion: { dimension: "count", factor: 1 },
  serving: { dimension: "serving", factor: 1 },
  batch: { dimension: "batch", factor: 1 },
  melon: { dimension: "melon", factor: 1 },
  bottle: { dimension: "bottle", factor: 1 },
};

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
}

export function convertComponentQuantity(
  quantity: number,
  fromUnit: UnitOfMeasure,
  toUnit: UnitOfMeasure,
): number | null {
  if (fromUnit === toUnit) return quantity;

  const from = UNIT_FACTORS[fromUnit];
  const to = UNIT_FACTORS[toUnit];
  if (from.dimension !== to.dimension || from.dimension === "count") {
    return null;
  }

  return (quantity * from.factor) / to.factor;
}

export function calculateComponentCost({
  lines,
  ingredients,
  batchMultiplier,
  yieldQuantity,
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
    );
    if (quantityInPricingUnits === null) {
      return {
        ...base,
        pricingUnit: ingredient.unit,
        costPerPricingUnit: costPerUnit,
        status: "incompatible_unit",
      };
    }

    return {
      ...base,
      pricingUnit: ingredient.unit,
      costPerPricingUnit: costPerUnit,
      quantityInPricingUnits,
      extendedCost: quantityInPricingUnits * costPerUnit * multiplier,
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
    isComplete: incompleteLineCount === 0,
    lines: costLines,
  };
}
