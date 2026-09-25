import { useMemo } from "react";
import { formatMoneyExact } from "../../lib/format";
import {
  useListComponent,
  useListComponentIngredient,
  useListDishComponent,
  useListDishIngredient,
  useListIngredient,
  useListIngredientPriceObservation,
  useListItemUnitMapping,
} from "../../lib/manifest-convex-react";
import { buildEventMenuCost } from "../events/eventMenuCost";
import { RecordedUnitMappings } from "../../lib/recordedUnitMappings";

/** Cost of one serving of a dish from its priced ingredient lines. */
export type DishPlateCost = {
  readonly costPerServing: number;
  readonly pricedLineCount: number;
  readonly incompleteLineCount: number;
  readonly mismatchCount: number;
};

/**
 * Plate cost for one dish — the same arithmetic the event Menu tab uses, run
 * as a one-serving line so the dish page and the margin board can never
 * disagree (#145). Returns undefined while any list is still loading.
 */
export function useDishPlateCost(dishId: string): DishPlateCost | undefined {
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const itemUnitMappings = useListItemUnitMapping();
  return useMemo(() => {
    if (
      !dishIngredients ||
      !dishComponents ||
      !components ||
      !componentIngredients ||
      !ingredients ||
      !priceObservations ||
      !itemUnitMappings
    ) {
      return undefined;
    }
    const rollup = buildEventMenuCost({
      eventId: "dish-plate-cost",
      expectedHeadcount: 1,
      eventDishes: [
        {
          id: dishId,
          eventId: "dish-plate-cost",
          dishId,
          quantityServings: 1,
        },
      ],
      dishIngredients: dishIngredients
        .filter((row) => row.dishId === dishId)
        .map((row) => ({
          id: row._id,
          dishId: row.dishId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: String(row.unit),
          wasteFactor: row.wasteFactor,
          addedAt: row.addedAt,
          deletedAt: row.deletedAt,
        })),
      dishComponents: dishComponents
        .filter((row) => row.dishId === dishId)
        .map((row) => ({
          id: row._id,
          dishId: row.dishId,
          componentId: row.componentId,
          yieldQuantity: Number(row.yieldQuantity),
          batchMultiplier: Number(row.batchMultiplier),
          deletedAt: row.deletedAt,
        })),
      components: components.map((row) => ({
        id: row._id,
        yieldQuantity: Number(row.yieldQuantity),
        deletedAt: row.deletedAt,
      })),
      componentIngredients: componentIngredients.map((row) => ({
        id: row._id,
        componentId: row.componentId,
        ingredientId: row.ingredientId,
        quantity: Number(row.quantity),
        unit: String(row.unit),
        deletedAt: row.deletedAt,
      })),
      ingredients: ingredients.map((row) => ({
        id: row._id,
        name: row.name,
        unit: String(row.unit),
        costPerUnit: Number(row.costPerUnit),
        deletedAt: row.deletedAt,
      })),
      priceObservations,
      unitMappings: RecordedUnitMappings.fromRows(itemUnitMappings),
    });
    const line = rollup.dishes[0];
    if (!line) return undefined;
    return {
      costPerServing: line.costPerServing,
      pricedLineCount: line.pricedLineCount,
      incompleteLineCount: line.incompleteLineCount,
      mismatchCount: line.mismatches.length,
    };
  }, [
    componentIngredients,
    components,
    dishComponents,
    dishId,
    dishIngredients,
    ingredients,
    itemUnitMappings,
    priceObservations,
  ]);
}

/** Plain-language state of a plate cost for the facts row. */
export function plateCostLabel(cost: DishPlateCost | undefined): string {
  if (!cost) return "…";
  if (cost.pricedLineCount === 0 && cost.incompleteLineCount === 0) {
    return "No recipe lines yet";
  }
  if (cost.pricedLineCount === 0) {
    return cost.mismatchCount > 0
      ? "Units not converted"
      : "Ingredients unpriced";
  }
  return `${formatMoneyExact(cost.costPerServing)} per serving`;
}

/** Second line under the figure when some lines could not be priced. */
export function plateCostHint(cost: DishPlateCost | undefined): string | null {
  if (!cost || cost.pricedLineCount === 0 || cost.incompleteLineCount === 0) {
    return null;
  }
  const noun = cost.incompleteLineCount === 1 ? "line" : "lines";
  return cost.mismatchCount > 0
    ? `${cost.incompleteLineCount} ${noun} not counted (unit not converted or unpriced)`
    : `${cost.incompleteLineCount} ${noun} unpriced`;
}

/** `<dt>/<dd>` pair for the dish header facts list. */
export function DishPlateCostFact({ dishId }: { readonly dishId: string }) {
  const cost = useDishPlateCost(dishId);
  const hint = plateCostHint(cost);
  return (
    <div>
      <dt>Plate cost</dt>
      <dd data-testid="dish-plate-cost">
        {plateCostLabel(cost)}
        {hint ? <span className="block text-sm text-ink-3">{hint}</span> : null}
      </dd>
    </div>
  );
}
