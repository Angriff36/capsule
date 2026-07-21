import {
  EventRecipeDemandReconciler,
  type EventRecipe,
  type EventRecipeIngredientLine,
  type EventRecipeLink,
} from "./EventRecipeDemandReconciler";
import { EventPrepTaskSynchronizer } from "./EventPrepTaskSynchronizer";

export type EventPrepUnit =
  | "each"
  | "gram"
  | "kilogram"
  | "ounce"
  | "pound"
  | "milliliter"
  | "liter"
  | "teaspoon"
  | "tablespoon"
  | "cup"
  | "pint"
  | "quart"
  | "gallon"
  | "portion";

export type EventPrepDishTask = {
  id: string;
  dishId: string;
  name: string;
  defaultQuantity?: number | null;
  defaultUnit?: EventPrepUnit | null;
  category?: string | null;
  taskType?: string | null;
  sortOrder?: number | null;
  recipeId?: string | null;
  ingredientId?: string | null;
  instructions?: string | null;
  status: string;
};

export type EventPrepTask = {
  id: string;
  eventDishId: string;
  eventId: string;
  dishId?: string | null;
  dishTaskId?: string | null;
  name: string;
  quantity: number;
  unit: EventPrepUnit;
  ingredientId?: string | null;
  ingredientDemandId?: string | null;
  recipeId?: string | null;
  specialInstructions?: string | null;
  isGenerated: boolean;
  status: string;
  version?: number;
  deletedAt?: number | null;
};

export type EventPrepDemand = {
  id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: EventPrepUnit;
  status: string;
  version: number;
};

export type EventPrepDish = {
  id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  specialInstructions?: string | null;
};

type DemandInput = {
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: EventPrepUnit;
  servings?: number;
  dishId?: string;
  sourceRecipeLineQuantity?: number;
  sourceBatchMultiplier?: number;
  sourceYieldQuantity?: number;
  idempotencyKey?: string;
};

type TaskInput = {
  eventDishId: string;
  eventId: string;
  name: string;
  quantity: number;
  unit: EventPrepUnit;
  ingredientId?: string;
  ingredientDemandId?: string;
  recipeId?: string;
  dishTaskId: string;
  dishId: string;
  category?: string;
  taskType?: string;
  specialInstructions?: string;
  isGenerated: true;
};

type Ports = {
  createDemand?: (input: DemandInput) => Promise<{ docId: string }>;
  confirmDemand?: (input: {
    docId: string;
    version: number;
    idempotencyKey?: string;
  }) => Promise<unknown>;
  recalculateDemand?: (input: {
    docId: string;
    version: number;
    newQuantity: number;
    reason: string;
  }) => Promise<unknown>;
  supersedeDemand?: (input: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
  createTask?: (input: TaskInput & { idempotencyKey?: string }) => Promise<{
    docId: string;
  }>;
  refreshGeneratedTask?: (input: {
    docId: string;
    version?: number;
    quantity: number;
    specialInstructions?: string;
  }) => Promise<unknown>;
};

type SyncInput = {
  eventDish: EventPrepDish;
  templates: readonly EventPrepDishTask[];
  tasks: readonly EventPrepTask[];
  demands: readonly EventPrepDemand[];
  /** When true, only materialize prep tasks; recipe reconcile owns demand. */
  skipDemand?: boolean;
};

export class EventPrepCoordinator {
  constructor(private readonly ports: Ports) {}

  async sync(input: SyncInput) {
    return new EventPrepTaskSynchronizer(this.ports).sync(input);
  }

  /**
   * EventDish add / servings adjust / remove → IngredientDemand via recipe BOM.
   * Aggregate key: eventId + ingredientId + unit.
   */
  async reconcileRecipeDemands(input: {
    eventId: string;
    eventDishes: readonly EventPrepDish[];
    dishRecipes: readonly EventRecipeLink[];
    recipes: readonly EventRecipe[];
    recipeIngredients: readonly EventRecipeIngredientLine[];
    demands: readonly EventPrepDemand[];
  }) {
    if (
      !this.ports.createDemand ||
      !this.ports.recalculateDemand ||
      !this.ports.supersedeDemand
    ) {
      throw new Error(
        "Recipe demand reconcile requires createDemand, recalculateDemand, and supersedeDemand",
      );
    }
    return new EventRecipeDemandReconciler({
      createDemand: this.ports.createDemand,
      recalculateDemand: this.ports.recalculateDemand,
      supersedeDemand: this.ports.supersedeDemand,
    }).reconcile(input);
  }

  async reconcileEventDemands(input: {
    eventId: string;
    tasks: readonly EventPrepTask[];
    demands: readonly EventPrepDemand[];
  }) {
    const groups = new Map<string, number>();
    for (const task of input.tasks) {
      if (
        task.eventId !== input.eventId ||
        task.deletedAt != null ||
        task.status === "cancelled" ||
        task.status === "completed" ||
        !task.ingredientId
      ) {
        continue;
      }
      const key = `${task.eventId}:${task.ingredientId}:${task.unit}`;
      groups.set(key, (groups.get(key) ?? 0) + task.quantity);
    }

    for (const demand of input.demands) {
      if (demand.eventId !== input.eventId || demand.status === "superseded") {
        continue;
      }
      const key = `${demand.eventId}:${demand.ingredientId}:${demand.unit}`;
      const quantity = groups.get(key);
      if (quantity == null || quantity <= 0) {
        if (this.ports.supersedeDemand) {
          await this.ports.supersedeDemand({
            docId: demand.id,
            version: demand.version,
            reason:
              "All prep tasks for this ingredient were removed from the event",
          });
        }
      } else if (
        quantity !== demand.requiredQuantity &&
        this.ports.recalculateDemand
      ) {
        await this.ports.recalculateDemand({
          docId: demand.id,
          version: demand.version,
          newQuantity: quantity,
          reason: "Event prep tasks changed",
        });
      }
    }
  }
}
