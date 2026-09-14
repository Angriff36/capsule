/** Matches src/features/kitchen/prepTaskQuantity.ts — Convex cannot import src. */
export const EQUIPMENT_FIXED_TASK_TYPE = "equipment_fixed";

export function quantityForDishTask(
  taskType: string | null | undefined,
  defaultQuantity: number | null | undefined,
  servings: number,
): number {
  if (taskType === EQUIPMENT_FIXED_TASK_TYPE) {
    return defaultQuantity ?? 1;
  }
  if (defaultQuantity == null) return servings;
  return defaultQuantity * servings;
}
