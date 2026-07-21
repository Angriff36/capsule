import { describe, expect, it, vi } from "vitest";
import { EventPrepCoordinator } from "../src/features/kitchen/EventPrepCoordinator";

describe("EventPrepCoordinator.reconcileRecipeDemands", () => {
  it("calculates, recalculates, and supersedes demand across add, adjust, and remove", async () => {
    const createDemand = vi.fn().mockResolvedValue({ docId: "demand-romaine" });
    const recalculateDemand = vi.fn().mockResolvedValue(undefined);
    const supersedeDemand = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EventPrepCoordinator({
      createDemand,
      recalculateDemand,
      supersedeDemand,
    });

    const catalogs = {
      dishRecipes: [
        {
          dishId: "dish-salad",
          recipeId: "recipe-salad",
          attachedAt: 1,
        },
      ],
      recipes: [
        {
          id: "recipe-salad",
          yieldQuantity: 10,
          batchMultiplier: 1,
        },
      ],
      recipeIngredients: [
        {
          recipeId: "recipe-salad",
          ingredientId: "ingredient-romaine",
          quantity: 2,
          unit: "kilogram" as const,
          addedAt: 1,
        },
      ],
    };

    // EventDishAdded — 40 servings → (2 * 1 * 40) / 10 = 8 kg
    await coordinator.reconcileRecipeDemands({
      eventId: "event-1",
      eventDishes: [
        {
          id: "event-dish-1",
          eventId: "event-1",
          dishId: "dish-salad",
          quantityServings: 40,
        },
      ],
      ...catalogs,
      demands: [],
    });

    expect(createDemand).toHaveBeenCalledTimes(1);
    expect(createDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        ingredientId: "ingredient-romaine",
        requiredQuantity: 8,
        unit: "kilogram",
        dishId: "dish-salad",
        servings: 40,
        sourceRecipeLineQuantity: 2,
        sourceBatchMultiplier: 1,
        sourceYieldQuantity: 10,
      }),
    );

    // EventDishServingsAdjusted — 60 servings → 12 kg
    await coordinator.reconcileRecipeDemands({
      eventId: "event-1",
      eventDishes: [
        {
          id: "event-dish-1",
          eventId: "event-1",
          dishId: "dish-salad",
          quantityServings: 60,
        },
      ],
      ...catalogs,
      demands: [
        {
          id: "demand-romaine",
          eventId: "event-1",
          ingredientId: "ingredient-romaine",
          requiredQuantity: 8,
          unit: "kilogram",
          status: "calculated",
          version: 1,
        },
      ],
    });

    expect(recalculateDemand).toHaveBeenCalledWith({
      docId: "demand-romaine",
      version: 1,
      newQuantity: 12,
      reason: "Event menu recipe requirements changed",
    });

    // EventDishRemoved — no remaining dishes → supersede
    await coordinator.reconcileRecipeDemands({
      eventId: "event-1",
      eventDishes: [],
      ...catalogs,
      demands: [
        {
          id: "demand-romaine",
          eventId: "event-1",
          ingredientId: "ingredient-romaine",
          requiredQuantity: 12,
          unit: "kilogram",
          status: "calculated",
          version: 2,
        },
      ],
    });

    expect(supersedeDemand).toHaveBeenCalledWith({
      docId: "demand-romaine",
      version: 2,
      reason: "Ingredient no longer required by the event menu",
    });
    expect(createDemand).toHaveBeenCalledTimes(1);
  });
});
