import { CapsuleCapabilityMutationResolver } from "./CapsuleCapabilityMutationResolver";

const resolver = new CapsuleCapabilityMutationResolver();

/**
 * North-star demo / AC proof set (recipe → event path). Not an MCP ceiling —
 * the catalog exposes every wiring capability that resolves to a Convex mutation.
 */
export const AGENT_AC_CAPABILITY_IDS: readonly string[] = [
  "Ingredient.introduce",
  "Recipe.draft",
  "RecipeIngredient.add",
  "RecipeImport.upload",
  "Dish.introduce",
  "DishRecipe.attach",
  "DishTask.add",
  "Menu.draft",
  "PrepTask.open",
  "PrepTask.refreshGenerated",
  "IngredientDemand.calculate",
  "IngredientDemand.confirm",
  "IngredientDemand.recalculate",
  "IngredientDemand.supersede",
  "Client.register",
  "Vendor.onboard",
  "WeeklyPurchasingConfig.configure",
  "Event.planEngagement",
  "EventDish.addToEvent",
  "Event.submitForApproval",
  "Event.approve",
];

/** Resolve wiring capabilityId → generated Convex mutation export name. */
export function mutationNameForCapability(capabilityId: string): string {
  return resolver.resolve(capabilityId);
}
