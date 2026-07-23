import type { EventStockShortage } from "../events/EventStockReservationCoordinator";
import { EventMenuReservationSync } from "./EventMenuReservationSync";
import { EventPrepCoordinator } from "./EventPrepCoordinator";

type DishTaskRow = {
  _id: string;
  dishId: string;
  name: string;
  defaultQuantity?: number | null;
  defaultUnit?: string | null;
  category?: string | null;
  taskType?: string | null;
  sortOrder?: number | null;
  recipeId?: string | null;
  ingredientId?: string | null;
  instructions?: string | null;
  status: string;
};

type PrepTaskRow = {
  _id: string;
  eventDishId: string;
  eventId: string;
  dishId?: string | null;
  dishTaskId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  ingredientId?: string | null;
  ingredientDemandId?: string | null;
  recipeId?: string | null;
  specialInstructions?: string | null;
  isGenerated: boolean;
  status: string;
  version: number;
  deletedAt?: number | null;
};

type DemandRow = {
  _id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  version: number;
  deletedAt?: number | null;
};

type IngredientRow = {
  _id: string;
  unit: string;
};

type InventoryItemRow = {
  _id: string;
  ingredientId: string;
  locationId: string;
  quantityOnHand: number;
  unit: string;
  stockedAt?: number | null;
  deletedAt?: number | null;
};

type InventoryReservationRow = {
  _id: string;
  inventoryItemId: string;
  inventoryLotId?: string | null;
  eventId: string;
  ingredientId: string;
  quantity: number;
  status: string;
  version: number;
  deletedAt?: number | null;
};

type InventoryLotRow = {
  _id: string;
  ingredientId: string;
  locationId: string;
  receiptQuantity: number;
  receivedAt?: number | null;
  deletedAt?: number | null;
};

type EventDishOverride = {
  id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  specialInstructions?: string | null;
};

type Catalogs = {
  dishTasks: readonly DishTaskRow[];
  prepTasks: readonly PrepTaskRow[];
  ingredients: readonly IngredientRow[];
  demands: readonly DemandRow[];
  dishRecipes: readonly {
    dishId: string;
    recipeId: string;
    deletedAt?: number | null;
    attachedAt?: number | null;
  }[];
  recipes: readonly {
    _id: string;
    yieldQuantity: number;
    batchMultiplier: number;
    deletedAt?: number | null;
  }[];
  recipeIngredients: readonly {
    recipeId: string;
    ingredientId: string;
    quantity: number;
    unit: string;
    deletedAt?: number | null;
    addedAt?: number | null;
  }[];
  eventDishes: readonly {
    _id: string;
    eventId: string;
    dishId: string;
    quantityServings: number;
    specialInstructions?: string | null;
    deletedAt?: number | null;
  }[];
  inventoryItems: readonly InventoryItemRow[];
  inventoryLots: readonly InventoryLotRow[];
  inventoryReservations: readonly InventoryReservationRow[];
};

type Ports = {
  // Convex mutation hooks are loosely typed at the call site.
  createTask: (input: never) => Promise<{ docId: string }>;
  refreshGeneratedTask: (input: never) => Promise<unknown>;
  createReservation: (input: {
    inventoryItemId: string;
    inventoryLotId?: string;
    eventId: string;
    ingredientId: string;
    quantity: number;
    idempotencyKey?: string;
  }) => Promise<{ docId: string }>;
  releaseReservation: (input: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
};

/** Owns Event menu demand + reservation sync after dish mutations. */
export class EventMenuSyncController {
  constructor(
    private readonly ports: Ports,
    private readonly catalogs: Catalogs,
  ) {}

  static requireCatalogs(input: {
    dishTasks: readonly DishTaskRow[] | undefined;
    prepTasks: readonly PrepTaskRow[] | undefined;
    ingredients: readonly IngredientRow[] | undefined;
    demands: readonly DemandRow[] | undefined;
    dishRecipes: Catalogs["dishRecipes"] | undefined;
    recipes: Catalogs["recipes"] | undefined;
    recipeIngredients: Catalogs["recipeIngredients"] | undefined;
    eventDishes: Catalogs["eventDishes"] | undefined;
    inventoryItems: readonly InventoryItemRow[] | undefined;
    inventoryLots: readonly InventoryLotRow[] | undefined;
    inventoryReservations: readonly InventoryReservationRow[] | undefined;
  }): Catalogs {
    if (
      input.dishTasks === undefined ||
      input.prepTasks === undefined ||
      input.ingredients === undefined ||
      input.demands === undefined ||
      input.dishRecipes === undefined ||
      input.recipes === undefined ||
      input.recipeIngredients === undefined ||
      input.eventDishes === undefined ||
      input.inventoryItems === undefined ||
      input.inventoryLots === undefined ||
      input.inventoryReservations === undefined
    ) {
      throw new Error("Event menu sync catalogs are still loading");
    }
    return {
      dishTasks: input.dishTasks,
      prepTasks: input.prepTasks,
      ingredients: input.ingredients,
      demands: input.demands,
      dishRecipes: input.dishRecipes,
      recipes: input.recipes,
      recipeIngredients: input.recipeIngredients,
      eventDishes: input.eventDishes,
      inventoryItems: input.inventoryItems,
      inventoryLots: input.inventoryLots,
      inventoryReservations: input.inventoryReservations,
    };
  }

  async syncRecipeDemands(
    eventId: string,
    _override?: EventDishOverride,
  ): Promise<EventStockShortage[]> {
    // IngredientDemand is Manifest-owned (EventDish → contributions → sync).
    // Host only reconciles inventory reservations from live demand rows.
    const demandTargets = this.catalogs.demands
      .filter(
        (demand) =>
          demand.eventId === eventId &&
          demand.deletedAt == null &&
          demand.status !== "superseded",
      )
      .map((demand) => ({
        eventId: demand.eventId,
        ingredientId: demand.ingredientId,
        unit: String(demand.unit),
        requiredQuantity: Number(demand.requiredQuantity),
        status: String(demand.status) as "calculated",
      }));
    const reservationResult = await new EventMenuReservationSync({
      createReservation: this.ports.createReservation,
      releaseReservation: this.ports.releaseReservation,
    }).afterDemandChange({
      eventId,
      demandTargets,
      items: this.catalogs.inventoryItems.map((item) => ({
        id: item._id,
        ingredientId: item.ingredientId,
        locationId: item.locationId,
        quantityOnHand: Number(item.quantityOnHand),
        unit: String(item.unit),
        stockedAt: item.stockedAt,
        deletedAt: item.deletedAt,
      })),
      lots: this.catalogs.inventoryLots.map((lot) => ({
        id: lot._id,
        ingredientId: lot.ingredientId,
        locationId: lot.locationId,
        receiptQuantity: Number(lot.receiptQuantity),
        receivedAt: lot.receivedAt,
        deletedAt: lot.deletedAt,
      })),
      reservations: this.catalogs.inventoryReservations.map((reservation) => ({
        id: reservation._id,
        inventoryItemId: reservation.inventoryItemId,
        inventoryLotId: reservation.inventoryLotId,
        eventId: reservation.eventId,
        ingredientId: reservation.ingredientId,
        quantity: Number(reservation.quantity),
        status: String(reservation.status),
        version: reservation.version,
        deletedAt: reservation.deletedAt,
      })),
    });
    return reservationResult.shortages;
  }

  async syncPrepForDish(
    eventDish: EventDishOverride,
  ): Promise<EventStockShortage[]> {
    const prep = this.prepCoordinator();
    await prep.sync({
      eventDish,
      templates: this.catalogs.dishTasks.map((task) => ({
        id: task._id,
        dishId: task.dishId,
        name: task.name,
        defaultQuantity: task.defaultQuantity,
        defaultUnit: (task.defaultUnit ??
          this.catalogs.ingredients.find(
            (ingredient) => ingredient._id === task.ingredientId,
          )?.unit ??
          "portion") as never,
        category: task.category ?? undefined,
        taskType: task.taskType ?? undefined,
        sortOrder: task.sortOrder ?? undefined,
        recipeId: task.recipeId,
        ingredientId: task.ingredientId,
        instructions: task.instructions,
        status: task.status,
      })),
      tasks: this.catalogs.prepTasks.map((task) => ({
        id: task._id,
        eventDishId: task.eventDishId,
        eventId: task.eventId,
        dishId: task.dishId,
        dishTaskId: task.dishTaskId,
        name: task.name,
        quantity: Number(task.quantity),
        unit: task.unit as never,
        ingredientId: task.ingredientId,
        ingredientDemandId: task.ingredientDemandId,
        recipeId: task.recipeId,
        specialInstructions: task.specialInstructions,
        isGenerated: task.isGenerated,
        status: task.status,
        version: task.version,
        deletedAt: task.deletedAt,
      })),
      demands: this.catalogs.demands.map((demand) => ({
        id: demand._id,
        eventId: demand.eventId,
        ingredientId: demand.ingredientId,
        requiredQuantity: Number(demand.requiredQuantity),
        unit: demand.unit as never,
        status: demand.status,
        version: demand.version,
      })),
      skipDemand: true,
    });
    return this.syncRecipeDemands(eventDish.eventId, eventDish);
  }

  private prepCoordinator() {
    return new EventPrepCoordinator({
      createTask: this.ports.createTask as never,
      refreshGeneratedTask: this.ports.refreshGeneratedTask as never,
    });
  }
}
