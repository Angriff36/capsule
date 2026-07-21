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
  /**
   * When true, only materialize PrepTask rows.
   * Recipe → IngredientDemand is Manifest-owned (event-purchasing.manifest).
   */
  skipDemand?: boolean;
};

/** Host prep-task materialization only — not purchasing / recipe demand. */
export class EventPrepCoordinator {
  constructor(private readonly ports: Ports) {}

  async sync(input: SyncInput) {
    return new EventPrepTaskSynchronizer(this.ports).sync(input);
  }
}
