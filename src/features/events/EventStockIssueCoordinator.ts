export type EventStockIssueReservation = {
  id: string;
  inventoryItemId: string;
  eventId: string;
  ingredientId: string;
  quantity: number;
  status: string;
  version: number;
  deletedAt?: number | null;
};

export type EventStockIssueDemand = {
  id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  version: number;
  deletedAt?: number | null;
};

export type EventStockIssueItem = {
  id: string;
  quantityOnHand: number;
  locationId: string;
  unit: string;
  useByAt?: number | null;
};

export type EventStockAdjustment = {
  inventoryItemId: string;
  previousQuantity: number;
  quantityOnHand: number;
  delta: number;
  reason: string;
};

type Ports = {
  consumeReservation: (input: {
    docId: string;
    version: number;
  }) => Promise<unknown>;
  confirmDemand: (input: {
    docId: string;
    version: number;
  }) => Promise<unknown>;
  fulfillDemand: (input: {
    docId: string;
    version: number;
  }) => Promise<unknown>;
};

/**
 * Issues (consumes) an active event reservation and fulfills demand only when
 * total consumed quantity covers the requirement. Stock on-hand is decremented
 * by the existing InventoryReservationConsumed → adjustQuantity reaction
 * (delta = −quantity); this coordinator returns that expected adjustment.
 */
export class EventStockIssueCoordinator {
  constructor(private readonly ports: Ports) {}

  async issue(input: {
    eventId: string;
    reservationId: string;
    reservations: readonly EventStockIssueReservation[];
    demands: readonly EventStockIssueDemand[];
    items: readonly EventStockIssueItem[];
  }) {
    const reservation = input.reservations.find(
      (row) => row.id === input.reservationId && row.deletedAt == null,
    );
    if (!reservation || reservation.eventId !== input.eventId) {
      throw new Error("Reservation not found for this event");
    }
    // Guard mirrors InventoryReservation.consume — blocks a second issue.
    if (reservation.status !== "active") {
      throw new Error("Reservation is not active");
    }

    const item = input.items.find(
      (row) => row.id === reservation.inventoryItemId,
    );
    if (!item) {
      throw new Error("Inventory item for reservation was not found");
    }
    // Guard mirrors InventoryReservation.consume — expired lots cannot issue.
    if (item.useByAt != null && item.useByAt < Date.now()) {
      throw new Error("Stock line is past its use-by date");
    }

    await this.ports.consumeReservation({
      docId: reservation.id,
      version: reservation.version,
    });

    // Manifest reaction: on InventoryReservationConsumed run adjustQuantity
    // with delta: 0 - payload.quantity.
    const delta = -reservation.quantity;
    const stockAdjustment: EventStockAdjustment = {
      inventoryItemId: item.id,
      previousQuantity: item.quantityOnHand,
      quantityOnHand: item.quantityOnHand + delta,
      delta,
      reason: "Reservation consumed",
    };

    const consumedForIngredient = input.reservations
      .filter(
        (row) =>
          row.eventId === input.eventId &&
          row.ingredientId === reservation.ingredientId &&
          row.deletedAt == null &&
          (row.status === "consumed" || row.id === reservation.id),
      )
      .reduce((sum, row) => sum + row.quantity, 0);

    const demand = input.demands.find(
      (row) =>
        row.eventId === input.eventId &&
        row.ingredientId === reservation.ingredientId &&
        row.deletedAt == null &&
        (row.status === "calculated" || row.status === "confirmed"),
    );

    let fulfilledDemandId: string | null = null;
    let demandPreserved = true;
    if (
      demand &&
      consumedForIngredient + Number.EPSILON >= demand.requiredQuantity
    ) {
      let version = demand.version;
      if (demand.status === "calculated") {
        await this.ports.confirmDemand({
          docId: demand.id,
          version,
        });
        // confirm (+1) then PurchaseNeedOpened → IngredientDemand.markReleased (+1)
        version += 2;
      }
      await this.ports.fulfillDemand({
        docId: demand.id,
        version,
      });
      fulfilledDemandId = demand.id;
      demandPreserved = false;
    }

    return {
      reservationId: reservation.id,
      consumedQuantity: reservation.quantity,
      stockAdjustment,
      fulfilledDemandId,
      demandPreserved,
      consumedForIngredient,
    };
  }
}
