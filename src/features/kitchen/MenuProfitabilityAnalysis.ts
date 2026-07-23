import {
  latestPriceByIngredient,
  resolveIngredientPrice,
  type IngredientPriceObservationInput,
} from "./IngredientPriceHistory";
import {
  calculateRecipeCost,
  type RecipeCostIngredientInput,
} from "./RecipeCostCalculator";
import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";

export const DEFAULT_GROSS_MARGIN_TARGET = 70;

type Deletable = { deletedAt?: unknown };

export interface MenuDishProfitabilityInput extends Deletable {
  id: string;
  version: number;
  dishId: string;
  sortOrder: number;
  sellingPrice?: number | string | null;
  course?: string | null;
}

export interface DishProfitabilityInput extends Deletable {
  id: string;
  name: string;
}

export interface DishRecipeProfitabilityInput extends Deletable {
  id: string;
  dishId: string;
  recipeId: string;
  yieldQuantity: number | string;
  batchMultiplier: number | string;
}

export interface RecipeIngredientProfitabilityInput extends Deletable {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number | string;
  unit: UnitOfMeasure;
}

export interface IngredientProfitabilityInput extends Deletable {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  costPerUnit: number | string;
}

export type MenuProfitabilityStatus =
  "on_target" | "low_margin" | "missing_price" | "incomplete_cost";

export interface MenuProfitabilityRow {
  menuDishId: string;
  menuDishVersion: number;
  dishId: string;
  dishName: string;
  course?: string;
  sortOrder: number;
  sellingPrice: number | null;
  recipeCost: number;
  grossMarginAmount: number | null;
  grossMarginPercent: number | null;
  foodCostPercent: number | null;
  recipeCount: number;
  incompleteCostLineCount: number;
  costComplete: boolean;
  status: MenuProfitabilityStatus;
  rank: number | null;
}

export interface MenuProfitabilityAnalysis {
  rows: MenuProfitabilityRow[];
  grossMarginTarget: number;
  portfolioMarginAmount: number;
  portfolioMarginPercent: number | null;
  rankedDishCount: number;
  lowMarginCount: number;
  unrankedDishCount: number;
}

export interface BuildMenuProfitabilityInput {
  menuDishes: MenuDishProfitabilityInput[];
  dishes: DishProfitabilityInput[];
  dishRecipes: DishRecipeProfitabilityInput[];
  recipeIngredients: RecipeIngredientProfitabilityInput[];
  ingredients: IngredientProfitabilityInput[];
  priceObservations: IngredientPriceObservationInput[];
  grossMarginTarget?: number;
}

function isActive(value: Deletable): boolean {
  return value.deletedAt == null;
}

function positiveNumber(value: number | string): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function sellingPrice(
  value: number | string | null | undefined,
): number | null {
  const numeric = Number(value);
  return value != null && Number.isFinite(numeric) && numeric > 0
    ? numeric
    : null;
}

function clampTarget(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(100, Math.max(0, value!))
    : DEFAULT_GROSS_MARGIN_TARGET;
}

export function buildMenuProfitability({
  menuDishes,
  dishes,
  dishRecipes,
  recipeIngredients,
  ingredients,
  priceObservations,
  grossMarginTarget,
}: BuildMenuProfitabilityInput): MenuProfitabilityAnalysis {
  const target = clampTarget(grossMarginTarget);
  const dishesById = new Map(
    dishes.filter(isActive).map((dish) => [dish.id, dish]),
  );
  const latestPrices = latestPriceByIngredient(priceObservations);
  const costingIngredients: RecipeCostIngredientInput[] = ingredients
    .filter(isActive)
    .map((ingredient) => {
      const price = resolveIngredientPrice(
        ingredient,
        latestPrices.get(ingredient.id),
      );
      return {
        id: ingredient.id,
        name: ingredient.name,
        unit: price.unit as UnitOfMeasure,
        costPerUnit: price.costPerUnit,
      };
    });
  const attachmentsByDish = new Map<string, DishRecipeProfitabilityInput[]>();
  for (const attachment of dishRecipes.filter(isActive)) {
    const existing = attachmentsByDish.get(attachment.dishId) ?? [];
    existing.push(attachment);
    attachmentsByDish.set(attachment.dishId, existing);
  }
  const linesByRecipe = new Map<string, RecipeIngredientProfitabilityInput[]>();
  for (const line of recipeIngredients.filter(isActive)) {
    const existing = linesByRecipe.get(line.recipeId) ?? [];
    existing.push(line);
    linesByRecipe.set(line.recipeId, existing);
  }

  const rows = menuDishes.filter(isActive).map<MenuProfitabilityRow>((line) => {
    const dish = dishesById.get(line.dishId);
    const attachments = attachmentsByDish.get(line.dishId) ?? [];
    let recipeCost = 0;
    let incompleteCostLineCount = attachments.length ? 0 : 1;
    let costComplete = attachments.length > 0;

    for (const attachment of attachments) {
      const recipeLines = linesByRecipe.get(attachment.recipeId) ?? [];
      const yieldQuantity = positiveNumber(attachment.yieldQuantity);
      const batchMultiplier = positiveNumber(attachment.batchMultiplier);
      const summary = calculateRecipeCost({
        lines: recipeLines.map((recipeLine) => ({
          id: recipeLine.id,
          ingredientId: recipeLine.ingredientId,
          quantity: Number(recipeLine.quantity),
          unit: recipeLine.unit,
        })),
        ingredients: costingIngredients,
        batchMultiplier: batchMultiplier ?? 0,
        yieldQuantity: yieldQuantity ?? 0,
      });
      const recipeIsComplete =
        recipeLines.length > 0 &&
        batchMultiplier != null &&
        yieldQuantity != null &&
        summary.isComplete &&
        summary.costPerYieldUnit != null;

      if (!recipeIsComplete) {
        costComplete = false;
        incompleteCostLineCount += Math.max(1, summary.incompleteLineCount);
      }
      if (summary.costPerYieldUnit != null) {
        recipeCost += summary.costPerYieldUnit;
      }
    }

    const price = sellingPrice(line.sellingPrice);
    const grossMarginAmount =
      price != null && costComplete ? price - recipeCost : null;
    const grossMarginPercent =
      price != null && grossMarginAmount != null
        ? (grossMarginAmount / price) * 100
        : null;
    const foodCostPercent =
      price != null && costComplete ? (recipeCost / price) * 100 : null;
    const status: MenuProfitabilityStatus =
      price == null
        ? "missing_price"
        : !costComplete
          ? "incomplete_cost"
          : grossMarginPercent! < target
            ? "low_margin"
            : "on_target";

    return {
      menuDishId: line.id,
      menuDishVersion: line.version,
      dishId: line.dishId,
      dishName: dish?.name.trim() || "Unavailable dish",
      course: line.course?.trim() || undefined,
      sortOrder: line.sortOrder,
      sellingPrice: price,
      recipeCost,
      grossMarginAmount,
      grossMarginPercent,
      foodCostPercent,
      recipeCount: attachments.length,
      incompleteCostLineCount,
      costComplete,
      status,
      rank: null,
    };
  });

  rows.sort((left, right) => {
    const leftRanked = left.grossMarginPercent != null;
    const rightRanked = right.grossMarginPercent != null;
    if (leftRanked && rightRanked) {
      return (
        right.grossMarginPercent! - left.grossMarginPercent! ||
        right.grossMarginAmount! - left.grossMarginAmount! ||
        left.dishName.localeCompare(right.dishName)
      );
    }
    if (leftRanked !== rightRanked) return leftRanked ? -1 : 1;
    return (
      left.sortOrder - right.sortOrder ||
      left.dishName.localeCompare(right.dishName)
    );
  });

  let rankedDishCount = 0;
  for (const row of rows) {
    if (row.grossMarginPercent != null) {
      rankedDishCount += 1;
      row.rank = rankedDishCount;
    }
  }

  const rankedRows = rows.filter((row) => row.rank != null);
  const totalSellingPrice = rankedRows.reduce(
    (total, row) => total + row.sellingPrice!,
    0,
  );
  const totalRecipeCost = rankedRows.reduce(
    (total, row) => total + row.recipeCost,
    0,
  );
  const portfolioMarginAmount = totalSellingPrice - totalRecipeCost;

  return {
    rows,
    grossMarginTarget: target,
    portfolioMarginAmount,
    portfolioMarginPercent:
      totalSellingPrice > 0
        ? (portfolioMarginAmount / totalSellingPrice) * 100
        : null,
    rankedDishCount,
    lowMarginCount: rows.filter((row) => row.status === "low_margin").length,
    unrankedDishCount: rows.length - rankedDishCount,
  };
}
