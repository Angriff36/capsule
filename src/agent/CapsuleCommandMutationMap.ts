/**
 * Maps wiring capabilityIds to Convex createVia / command mutation exports.
 * Keep in sync with generated `api.mutations` — regenerate awareness only;
 * do not invent alternate write paths.
 */
export const CAPABILITY_TO_MUTATION: Readonly<Record<string, string>> = {
  "Ingredient.introduce": "Ingredient_createViaIntroduce",
  "Recipe.draft": "Recipe_createViaDraft",
  "RecipeIngredient.add": "RecipeIngredient_createViaAdd",
  "RecipeImport.upload": "RecipeImport_createViaUpload",
  "Dish.introduce": "Dish_createViaIntroduce",
  "DishRecipe.attach": "DishRecipe_createViaAttach",
  "Menu.draft": "Menu_createViaDraft",
  "PrepTask.open": "PrepTask_createViaOpen",
  "Event.planEngagement": "Event_createViaPlanEngagement",
  "EventDish.addToEvent": "EventDish_createViaAddToEvent",
};

/** Capabilities the product AC expects agents to discover and execute. */
export const AGENT_AC_CAPABILITY_IDS: readonly string[] = [
  "Ingredient.introduce",
  "Recipe.draft",
  "RecipeIngredient.add",
  "RecipeImport.upload",
  "Dish.introduce",
  "DishRecipe.attach",
  "Menu.draft",
  "PrepTask.open",
  "Event.planEngagement",
  "EventDish.addToEvent",
];

export function mutationNameForCapability(capabilityId: string): string {
  const name = CAPABILITY_TO_MUTATION[capabilityId];
  if (!name) {
    throw new Error(
      `No Convex mutation mapping for capability '${capabilityId}'. ` +
        `Agents may only call mapped governed commands.`,
    );
  }
  return name;
}
