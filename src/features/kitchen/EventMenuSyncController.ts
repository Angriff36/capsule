import type { EventStockShortage } from "../events/EventStockReservationCoordinator";
import { EventMenuReservationSync } from "./EventMenuReservationSync";

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
  demands: readonly DemandRow[];
  inventoryItems: readonly InventoryItemRow[];
  inventoryLots: readonly InventoryLotRow[];
  inventoryReservations: readonly InventoryReservationRow[];
};

type Ports = {
  reconcilePrep: (eventDishId: string) => Promise<{
    created: number;
    updated: number;
    unresolved: { name: string; reason: string }[];
    notice?: string;
  }>;
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
    [K in keyof Catalogs]: Catalogs[K] | undefined;
  }): Catalogs {
    if (
      input.demands === undefined ||
      input.inventoryItems === undefined ||
      input.inventoryLots === undefined ||
      input.inventoryReservations === undefined
    )
      throw new Error("Stock sync catalogs are still loading");
    return {
      demands: input.demands,
      inventoryItems: input.inventoryItems,
      inventoryLots: input.inventoryLots,
      inventoryReservations: input.inventoryReservations,
    };
  }

  async syncComponentDemands(eventId: string): Promise<EventStockShortage[]> {
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

  async syncPrepForDish(eventDish: EventDishOverride): Promise<{
    shortages: EventStockShortage[];
    taskCount: number;
    noOpReason?: string;
  }> {
    // The server reads the current menu line, templates and complete work groups
    // atomically. Reactive browser catalogs can be stale after a serving change.
    const result = await this.ports.reconcilePrep(eventDish.id);
    const shortages = await this.syncComponentDemands(eventDish.eventId);
    return {
      shortages,
      taskCount: result.created + result.updated,
      noOpReason: result.unresolved.length
        ? result.unresolved
            .map((step) => `${step.name}: ${step.reason}`)
            .join(" ")
        : result.notice,
    };
  }
}
