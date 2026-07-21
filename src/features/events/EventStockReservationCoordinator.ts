export type EventStockDemand = {
  id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
};

export type EventStockItem = {
  id: string;
  ingredientId: string;
  quantityOnHand: number;
  unit: string;
  stockedAt?: number | null;
  deletedAt?: number | null;
};

export type EventStockReservation = {
  id: string;
  inventoryItemId: string;
  eventId: string;
  ingredientId: string;
  quantity: number;
  status: string;
  deletedAt?: number | null;
};

export type EventStockShortage = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number;
  reservedQuantity: number;
  shortageQuantity: number;
};

export type EventStockReservationCreated = {
  inventoryItemId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
};

type Ports = {
  createReservation: (input: {
    inventoryItemId: string;
    eventId: string;
    ingredientId: string;
    quantity: number;
    idempotencyKey?: string;
  }) => Promise<{ docId: string }>;
};

type ItemAvailability = {
  item: EventStockItem;
  available: number;
};

/**
 * Allocates InventoryReservation rows for an event's IngredientDemand.
 * Remaining need = demand − active event reservations; stock cap = on-hand −
 * all active reservations on that InventoryItem (availableQuantity).
 */
export class EventStockReservationCoordinator {
  constructor(private readonly ports: Ports) {}

  async allocate(input: {
    eventId: string;
    demands: readonly EventStockDemand[];
    items: readonly EventStockItem[];
    reservations: readonly EventStockReservation[];
  }) {
    const availability = this.itemAvailability(input.items, input.reservations);
    const created: EventStockReservationCreated[] = [];
    const shortages: EventStockShortage[] = [];

    const demands = input.demands.filter(
      (demand) =>
        demand.eventId === input.eventId &&
        (demand.status === "calculated" || demand.status === "confirmed") &&
        demand.requiredQuantity > 0,
    );

    for (const demand of demands) {
      const alreadyReserved = this.activeEventReserved(
        input.reservations,
        input.eventId,
        demand.ingredientId,
      );
      let remaining = demand.requiredQuantity - alreadyReserved;
      if (remaining <= 0) continue;

      const candidates = availability
        .filter(
          (entry) =>
            entry.item.ingredientId === demand.ingredientId &&
            entry.item.unit === demand.unit &&
            entry.available > 0,
        )
        .sort((left, right) => right.available - left.available);

      let newlyReserved = 0;
      for (const entry of candidates) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, entry.available);
        if (quantity <= 0) continue;
        await this.ports.createReservation({
          inventoryItemId: entry.item.id,
          eventId: input.eventId,
          ingredientId: demand.ingredientId,
          quantity,
          idempotencyKey: `event-stock-reserve:${input.eventId}:${entry.item.id}:${demand.ingredientId}:${quantity}:${alreadyReserved + newlyReserved}`,
        });
        entry.available -= quantity;
        remaining -= quantity;
        newlyReserved += quantity;
        created.push({
          inventoryItemId: entry.item.id,
          ingredientId: demand.ingredientId,
          quantity,
          unit: demand.unit,
        });
      }

      const reservedQuantity = alreadyReserved + newlyReserved;
      if (remaining > 0) {
        shortages.push({
          ingredientId: demand.ingredientId,
          unit: demand.unit,
          requiredQuantity: demand.requiredQuantity,
          reservedQuantity,
          shortageQuantity: remaining,
        });
      }
    }

    return { created, shortages };
  }

  private itemAvailability(
    items: readonly EventStockItem[],
    reservations: readonly EventStockReservation[],
  ): ItemAvailability[] {
    return items
      .filter((item) => item.stockedAt != null && item.deletedAt == null)
      .map((item) => {
        const reserved = reservations
          .filter(
            (reservation) =>
              reservation.inventoryItemId === item.id &&
              reservation.status === "active" &&
              reservation.deletedAt == null,
          )
          .reduce((sum, reservation) => sum + reservation.quantity, 0);
        return {
          item,
          available: Math.max(0, item.quantityOnHand - reserved),
        };
      });
  }

  private activeEventReserved(
    reservations: readonly EventStockReservation[],
    eventId: string,
    ingredientId: string,
  ) {
    return reservations
      .filter(
        (reservation) =>
          reservation.eventId === eventId &&
          reservation.ingredientId === ingredientId &&
          reservation.status === "active" &&
          reservation.deletedAt == null,
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
  }
}
