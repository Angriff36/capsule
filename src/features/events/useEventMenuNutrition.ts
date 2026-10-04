import { useMemo } from "react";
import type { MenuRecipeRows } from "../../../convex/menuRecipeLookup";
import {
  calculateComponentNutrition,
  sumPerGuestNutrition,
  toNutritionIngredient,
  type ComponentNutritionLineInput,
} from "../kitchen/ComponentNutrition";

/**
 * Per-guest nutrition across an event's dishes → components. Operational
 * estimate; it does not re-scale for dish-level component yields.
 */
export function useEventMenuNutrition(
  dishIds: readonly string[],
  rows: MenuRecipeRows | undefined,
) {
  const dishComponents = rows?.dishComponents;
  const components = rows?.components;
  const componentIngredients = rows?.componentIngredients;
  const ingredients = rows?.ingredients;

  const totals = useMemo(() => {
    const wanted = new Set(dishIds.map(String));
    const nutritionIngredients = (ingredients ?? [])
      .filter((ingredient) => ingredient.deletedAt == null)
      .map(toNutritionIngredient);
    const linesByComponent = new Map<string, ComponentNutritionLineInput[]>();
    for (const line of componentIngredients ?? []) {
      if (line.deletedAt != null) continue;
      const list = linesByComponent.get(line.componentId) ?? [];
      list.push({
        id: line._id,
        ingredientId: line.ingredientId,
        quantity: Number(line.quantity),
        unit: line.unit,
      });
      linesByComponent.set(line.componentId, list);
    }
    const componentById = new Map(
      (components ?? []).map((component) => [component._id, component]),
    );
    const summaries = (dishComponents ?? [])
      .filter(
        (attachment) =>
          attachment.deletedAt == null && wanted.has(String(attachment.dishId)),
      )
      .map((attachment) => {
        const component = componentById.get(attachment.componentId);
        return calculateComponentNutrition({
          lines: linesByComponent.get(attachment.componentId) ?? [],
          ingredients: nutritionIngredients,
          servesPerYield: Number(
            (component as { servesPerYield?: number } | undefined)
              ?.servesPerYield ?? 1,
          ),
        });
      });
    return sumPerGuestNutrition(summaries);
  }, [dishIds, dishComponents, components, componentIngredients, ingredients]);

  const loading =
    dishComponents === undefined ||
    components === undefined ||
    componentIngredients === undefined ||
    ingredients === undefined;
  const coverageNote =
    totals.componentCount === 0
      ? "Add dishes with components to estimate per-guest nutrition."
      : `Estimated across ${totals.componentCount} component${totals.componentCount === 1 ? "" : "s"} on this event${totals.isComplete ? "" : ` (${totals.measuredComponentCount} with nutrition on file)`}.`;

  return { totals, loading, coverageNote };
}
