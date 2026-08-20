/** Keep as-is / cancel / dismissed / anything except an explicit confirm. */
export type DishIngredientRemovalIntent = "keep" | "remove";

/**
 * Product lock: Keep as-is must not remove a dish ingredient.
 * Only `confirmed === true` (askConfirm resolved confirmed) may delete.
 */
export function dishIngredientRemovalIntent(
  confirmed: unknown,
): DishIngredientRemovalIntent {
  return confirmed === true ? "remove" : "keep";
}

export async function applyDishIngredientRemoval(input: {
  confirmed: unknown;
  remove: () => Promise<unknown> | unknown;
}): Promise<DishIngredientRemovalIntent> {
  const intent = dishIngredientRemovalIntent(input.confirmed);
  if (intent !== "remove") return "keep";
  await input.remove();
  return "remove";
}
