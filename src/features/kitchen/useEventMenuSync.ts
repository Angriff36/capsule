import { useMemo } from "react";
import {
  useCreateInventoryReservation,
  useCreatePrepTask,
  useInventoryReservationRelease,
  useListDishRecipe,
  useListDishTask,
  useListEventDish,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListPrepTask,
  useListRecipe,
  useListRecipeIngredient,
  usePrepTaskRefreshGenerated,
} from "../../lib/manifest-convex-react";
import type { EventStockShortage } from "../events/EventStockReservationCoordinator";
import { EventMenuSyncController } from "./EventMenuSyncController";

export type EventDishSyncTarget = {
  id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  specialInstructions?: string;
};

/**
 * Shared bridge so Event menu + Command deck both materialize DishTask → PrepTask.
 */
export function useEventMenuSync() {
  const dishTasks = useListDishTask();
  const dishRecipes = useListDishRecipe();
  const recipes = useListRecipe();
  const recipeIngredients = useListRecipeIngredient();
  const prepTasks = useListPrepTask();
  const eventDishes = useListEventDish();
  const ingredients = useListIngredient();
  const demands = useListIngredientDemand();
  const inventoryItems = useListInventoryItem();
  const inventoryLots = useListInventoryLot();
  const inventoryReservations = useListInventoryReservation();
  const createPrepTask = useCreatePrepTask();
  const refreshGeneratedTask = usePrepTaskRefreshGenerated();
  const createReservation = useCreateInventoryReservation();
  const releaseReservation = useInventoryReservationRelease();

  const ready =
    dishTasks !== undefined &&
    prepTasks !== undefined &&
    eventDishes !== undefined &&
    ingredients !== undefined &&
    demands !== undefined &&
    dishRecipes !== undefined &&
    recipes !== undefined &&
    recipeIngredients !== undefined &&
    inventoryItems !== undefined &&
    inventoryLots !== undefined &&
    inventoryReservations !== undefined;

  const controller = useMemo(() => {
    if (!ready) return null;
    return new EventMenuSyncController(
      {
        createTask: ((input: never) => createPrepTask(input)) as never,
        refreshGeneratedTask: ((input: never) =>
          refreshGeneratedTask(input)) as never,
        createReservation: async (input) => {
          const doc = (await createReservation(input)) as { docId: string };
          return { docId: doc.docId };
        },
        releaseReservation: (input) => releaseReservation(input),
      },
      EventMenuSyncController.requireCatalogs({
        dishTasks: dishTasks as never,
        prepTasks: prepTasks as never,
        ingredients: ingredients as never,
        demands: demands as never,
        dishRecipes: dishRecipes as never,
        recipes: recipes as never,
        recipeIngredients: recipeIngredients as never,
        eventDishes: eventDishes as never,
        inventoryItems: inventoryItems as never,
        inventoryLots: inventoryLots as never,
        inventoryReservations: inventoryReservations as never,
      }),
    );
  }, [
    createPrepTask,
    createReservation,
    demands,
    dishRecipes,
    dishTasks,
    eventDishes,
    ingredients,
    inventoryItems,
    inventoryLots,
    inventoryReservations,
    prepTasks,
    ready,
    recipeIngredients,
    recipes,
    refreshGeneratedTask,
    releaseReservation,
  ]);

  return {
    ready,
    // Reconcile prep tasks against the dish's templates. Only needed AFTER an
    // event dish already exists — adding one generates its prep tasks
    // server-side (EventDishAdded fanOut in production/task.manifest). Calling
    // this straight after a create duplicates them, because the reactive
    // catalogs have not seen the server's rows yet.
    syncPrepForDish: async (
      target: EventDishSyncTarget,
    ): Promise<EventStockShortage[]> => {
      if (!controller) {
        throw new Error("Prep sync catalogs are still loading");
      }
      return controller.syncPrepForDish(target);
    },
    // Stock shortages only — no prep-task materialization. This is what a
    // just-created event dish needs.
    syncStockForEvent: async (
      eventId: string,
    ): Promise<EventStockShortage[]> => {
      if (!controller) {
        throw new Error("Prep sync catalogs are still loading");
      }
      return controller.syncRecipeDemands(eventId);
    },
  };
}
