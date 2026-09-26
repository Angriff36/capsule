/** Stored on DishTask.taskType so event fan-out does not × guest count. */
export const EQUIPMENT_FIXED_TASK_TYPE = "equipment_fixed";

export function quantityForDishTask(
  taskType: string | null | undefined,
  defaultQuantity: number | null | undefined,
  servings: number,
): number {
  const quantity = defaultQuantity ?? servings;
  if (quantity <= 0 || servings <= 0) {
    throw new Error(
      "This prep quantity has to be more than zero. Enter how much to prep.",
    );
  }
  if (taskType === EQUIPMENT_FIXED_TASK_TYPE) {
    return defaultQuantity ?? 1;
  }
  return defaultQuantity == null ? servings : quantity * servings;
}
