import type {
  EventPrepDemand,
  EventPrepDish,
  EventPrepUnit,
} from "./EventPrepCoordinator";
import { EventPrepCoordinator } from "./EventPrepCoordinator";
import type {
  EventRecipe,
  EventRecipeIngredientLine,
  EventRecipeLink,
} from "./EventRecipeDemandReconciler";

type DemandRow = {
  _id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  version: number;
};

type EventDishRow = {
  _id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  specialInstructions?: string | null;
  deletedAt?: number | null;
};

type DishRecipeRow = {
  dishId: string;
  recipeId: string;
  deletedAt?: number | null;
  attachedAt?: number | null;
};

type RecipeRow = {
  _id: string;
  yieldQuantity: number;
  batchMultiplier: number;
  deletedAt?: number | null;
};

type RecipeIngredientRow = {
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  deletedAt?: number | null;
  addedAt?: number | null;
};

/** Maps Event menu lists into EventPrepCoordinator.reconcileRecipeDemands. */
export class EventMenuRecipeDemandSync {
  constructor(
    private readonly coordinator: EventPrepCoordinator,
    private readonly catalogs: {
      dishRecipes: readonly DishRecipeRow[];
      recipes: readonly RecipeRow[];
      recipeIngredients: readonly RecipeIngredientRow[];
      demands: readonly DemandRow[];
    },
  ) {}

  async forEventDishes(input: {
    eventId: string;
    eventDishes: readonly EventPrepDish[];
  }) {
    return this.coordinator.reconcileRecipeDemands({
      eventId: input.eventId,
      eventDishes: input.eventDishes,
      dishRecipes: this.catalogs.dishRecipes.map((row): EventRecipeLink => ({
        dishId: row.dishId,
        recipeId: row.recipeId,
        deletedAt: row.deletedAt,
        attachedAt: row.attachedAt,
      })),
      recipes: this.catalogs.recipes.map((row): EventRecipe => ({
        id: row._id,
        yieldQuantity: Number(row.yieldQuantity),
        batchMultiplier: Number(row.batchMultiplier),
        deletedAt: row.deletedAt,
      })),
      recipeIngredients: this.catalogs.recipeIngredients.map(
        (row): EventRecipeIngredientLine => ({
          recipeId: row.recipeId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: row.unit as EventPrepUnit,
          deletedAt: row.deletedAt,
          addedAt: row.addedAt,
        }),
      ),
      demands: this.catalogs.demands.map((row): EventPrepDemand => ({
        id: row._id,
        eventId: row.eventId,
        ingredientId: row.ingredientId,
        requiredQuantity: Number(row.requiredQuantity),
        unit: row.unit as EventPrepUnit,
        status: row.status,
        version: row.version,
      })),
    });
  }

  static activeEventDishes(
    eventId: string,
    rows: readonly EventDishRow[],
    override?: EventPrepDish,
  ): EventPrepDish[] {
    const mapped = rows
      .filter((row) => row.deletedAt == null && row.eventId === eventId)
      .map((row): EventPrepDish => ({
        id: row._id,
        eventId: row.eventId,
        dishId: row.dishId,
        quantityServings: Number(row.quantityServings),
        specialInstructions: row.specialInstructions,
      }));
    if (!override) return mapped;
    const without = mapped.filter((row) => row.id !== override.id);
    if (override.quantityServings <= 0) return without;
    return [...without, override];
  }
}
