import {
  calculateComponentCost,
  convertComponentQuantity,
  type ComponentCostIngredientInput,
} from "../kitchen/ComponentCostCalculator";
import {
  latestPriceByIngredient,
  resolveIngredientPrice,
  type IngredientPriceObservationInput,
} from "../kitchen/IngredientPriceHistory";
import type { UnitOfMeasure } from "../kitchen/import/UnitOfMeasureMapper";

type SoftDelete = { deletedAt?: unknown };

export type EventMenuCostDish = SoftDelete & {
  id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  headcountOverride?: number | null;
};

export type EventMenuCostDishIngredient = SoftDelete & {
  id: string;
  dishId: string;
  ingredientId: string;
  quantity: number | string;
  unit: string;
  wasteFactor?: number | string | null;
  addedAt?: unknown;
};

export type EventMenuCostDishComponent = SoftDelete & {
  id: string;
  dishId: string;
  componentId: string;
  yieldQuantity: number | string;
  batchMultiplier: number | string;
};

export type EventMenuCostComponent = SoftDelete & {
  id: string;
  yieldQuantity: number | string;
};

export type EventMenuCostComponentIngredient = SoftDelete & {
  id: string;
  componentId: string;
  ingredientId: string;
  quantity: number | string;
  unit: string;
};

export type EventMenuCostIngredient = SoftDelete & {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | string;
};

export type EventMenuUnitMismatch = {
  dishId: string;
  ingredientId: string;
  ingredientName: string;
  recipeUnit: string;
  stockUnit: string;
  message: string;
};

export type EventMenuDishCost = {
  eventDishId: string;
  dishId: string;
  servings: number;
  foodCost: number;
  costPerServing: number;
  pricedLineCount: number;
  incompleteLineCount: number;
  mismatches: EventMenuUnitMismatch[];
};

export type EventMenuCostRollup = {
  foodCost: number;
  costPerServing: number;
  servings: number;
  pricedLineCount: number;
  mismatches: EventMenuUnitMismatch[];
  dishes: EventMenuDishCost[];
};

export type BuildEventMenuCostInput = {
  eventId: string;
  expectedHeadcount: number;
  eventDishes: readonly EventMenuCostDish[];
  dishIngredients: readonly EventMenuCostDishIngredient[];
  dishComponents?: readonly EventMenuCostDishComponent[];
  components?: readonly EventMenuCostComponent[];
  componentIngredients?: readonly EventMenuCostComponentIngredient[];
  ingredients: readonly EventMenuCostIngredient[];
  priceObservations?: readonly IngredientPriceObservationInput[];
};

function isActive(row: SoftDelete) {
  return row.deletedAt == null;
}

function servingsFor(
  dish: EventMenuCostDish,
  expectedHeadcount: number,
): number {
  const override = Number(dish.headcountOverride ?? 0);
  if (Number.isFinite(override) && override > 0) return override;
  const qty = Number(dish.quantityServings);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const headcount = Number(expectedHeadcount);
  return Number.isFinite(headcount) && headcount > 0 ? headcount : 0;
}

function asUnit(value: string): UnitOfMeasure {
  return value as UnitOfMeasure;
}

function priceDirectLine(
  line: EventMenuCostDishIngredient,
  ingredient: ComponentCostIngredientInput,
): {
  extendedCost: number;
  status: "priced" | "missing_price" | "incompatible_unit";
} {
  const costPerUnit = Number(ingredient.costPerUnit);
  if (!Number.isFinite(costPerUnit) || costPerUnit <= 0) {
    return { extendedCost: 0, status: "missing_price" };
  }
  const quantity = Number(line.quantity);
  const wasteFactor = line.wasteFactor != null ? Number(line.wasteFactor) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { extendedCost: 0, status: "missing_price" };
  }
  const converted = convertComponentQuantity(
    quantity,
    asUnit(String(line.unit)),
    asUnit(ingredient.unit),
  );
  if (converted == null) {
    return { extendedCost: 0, status: "incompatible_unit" };
  }
  const waste =
    Number.isFinite(wasteFactor) && wasteFactor > 0 ? wasteFactor : 1;
  return { extendedCost: converted * waste * costPerUnit, status: "priced" };
}

function mismatchMessage(
  ingredientName: string,
  recipeUnit: string,
  stockUnit: string,
): string {
  return `${ingredientName} recipe uses ${recipeUnit} but stock/catalog is ${stockUnit}. These units are not converted.`;
}

export function buildEventMenuCost(
  input: BuildEventMenuCostInput,
): EventMenuCostRollup {
  const latestPrices = latestPriceByIngredient([
    ...(input.priceObservations ?? []),
  ]);
  const costingIngredients: ComponentCostIngredientInput[] = input.ingredients
    .filter(isActive)
    .map((ingredient) => {
      const price = resolveIngredientPrice(
        {
          id: ingredient.id,
          unit: ingredient.unit,
          costPerUnit: ingredient.costPerUnit,
        },
        latestPrices.get(ingredient.id),
      );
      return {
        id: ingredient.id,
        name: ingredient.name,
        unit: asUnit(price.unit),
        costPerUnit: price.costPerUnit,
      };
    });
  const ingredientsById = new Map(
    costingIngredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const linesByDish = new Map<string, EventMenuCostDishIngredient[]>();
  for (const line of input.dishIngredients.filter(isActive)) {
    if (line.addedAt == null) continue;
    const list = linesByDish.get(line.dishId) ?? [];
    list.push(line);
    linesByDish.set(line.dishId, list);
  }
  const attachmentsByDish = new Map<string, EventMenuCostDishComponent[]>();
  for (const attachment of (input.dishComponents ?? []).filter(isActive)) {
    const list = attachmentsByDish.get(attachment.dishId) ?? [];
    list.push(attachment);
    attachmentsByDish.set(attachment.dishId, list);
  }
  const componentsById = new Map(
    (input.components ?? []).filter(isActive).map((row) => [row.id, row]),
  );
  const linesByComponent = new Map<
    string,
    EventMenuCostComponentIngredient[]
  >();
  for (const line of (input.componentIngredients ?? []).filter(isActive)) {
    const list = linesByComponent.get(line.componentId) ?? [];
    list.push(line);
    linesByComponent.set(line.componentId, list);
  }

  const dishes = input.eventDishes
    .filter(
      (row) => isActive(row) && String(row.eventId) === String(input.eventId),
    )
    .map<EventMenuDishCost>((row) => {
      const servings = servingsFor(row, input.expectedHeadcount);
      const mismatches: EventMenuUnitMismatch[] = [];
      let perServing = 0;
      let pricedLineCount = 0;
      let incompleteLineCount = 0;

      for (const line of linesByDish.get(row.dishId) ?? []) {
        const ingredient = ingredientsById.get(line.ingredientId);
        if (!ingredient) {
          incompleteLineCount += 1;
          continue;
        }
        const priced = priceDirectLine(line, ingredient);
        if (priced.status === "priced") {
          pricedLineCount += 1;
          perServing += priced.extendedCost;
        } else if (priced.status === "incompatible_unit") {
          incompleteLineCount += 1;
          mismatches.push({
            dishId: row.dishId,
            ingredientId: line.ingredientId,
            ingredientName: ingredient.name,
            recipeUnit: String(line.unit),
            stockUnit: ingredient.unit,
            message: mismatchMessage(
              ingredient.name,
              String(line.unit),
              ingredient.unit,
            ),
          });
        } else {
          incompleteLineCount += 1;
        }
      }

      for (const attachment of attachmentsByDish.get(row.dishId) ?? []) {
        const component = componentsById.get(attachment.componentId);
        const componentLines =
          linesByComponent.get(attachment.componentId) ?? [];
        const yieldQuantity = Number(attachment.yieldQuantity);
        const batchMultiplier = Number(attachment.batchMultiplier);
        const summary = calculateComponentCost({
          lines: componentLines.map((line) => ({
            id: line.id,
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity),
            unit: asUnit(String(line.unit)),
          })),
          ingredients: costingIngredients,
          batchMultiplier:
            Number.isFinite(batchMultiplier) && batchMultiplier > 0
              ? batchMultiplier
              : 0,
          yieldQuantity:
            Number.isFinite(yieldQuantity) && yieldQuantity > 0
              ? yieldQuantity
              : Number(component?.yieldQuantity) || 0,
        });
        if (summary.costPerYieldUnit != null) {
          perServing += summary.costPerYieldUnit;
        }
        pricedLineCount += summary.pricedLineCount;
        incompleteLineCount += summary.incompleteLineCount;
        for (const line of summary.lines) {
          if (line.status !== "incompatible_unit") continue;
          mismatches.push({
            dishId: row.dishId,
            ingredientId: line.ingredientId,
            ingredientName: line.ingredientName,
            recipeUnit: String(line.lineUnit),
            stockUnit: String(line.pricingUnit ?? ""),
            message: mismatchMessage(
              line.ingredientName,
              String(line.lineUnit),
              String(line.pricingUnit ?? ""),
            ),
          });
        }
      }

      const foodCost = perServing * servings;
      return {
        eventDishId: row.id,
        dishId: row.dishId,
        servings,
        foodCost,
        costPerServing: perServing,
        pricedLineCount,
        incompleteLineCount,
        mismatches,
      };
    });

  const foodCost = dishes.reduce((sum, dish) => sum + dish.foodCost, 0);
  const servings = dishes.reduce((sum, dish) => sum + dish.servings, 0);
  return {
    foodCost,
    costPerServing: servings > 0 ? foodCost / servings : 0,
    servings,
    pricedLineCount: dishes.reduce(
      (sum, dish) => sum + dish.pricedLineCount,
      0,
    ),
    mismatches: dishes.flatMap((dish) => dish.mismatches),
    dishes,
  };
}

export function eventMenuCostForDish(
  rollup: EventMenuCostRollup,
  eventDishId: string,
): EventMenuDishCost | undefined {
  return rollup.dishes.find((dish) => dish.eventDishId === eventDishId);
}
