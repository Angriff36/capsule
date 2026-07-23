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
  locationId?: string;
  quantityOnHand: number;
  unit: string;
  stockedAt?: number | null;
  deletedAt?: number | null;
};

export type EventStockReservation = {
  id: string;
  inventoryItemId: string;
  inventoryLotId?: string | null;
  eventId: string;
  ingredientId: string;
  quantity: number;
  status: string;
  version?: number;
  deletedAt?: number | null;
};

export type EventStockLot = {
  id: string;
  ingredientId: string;
  locationId: string;
  receiptQuantity: number;
  receivedAt?: number | null;
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
  inventoryLotId?: string;
  ingredientId: string;
  quantity: number;
  unit: string;
};

export type EventStockReservationReleased = {
  reservationId: string;
  ingredientId: string;
  quantity: number;
};

type Ports = {
  createReservation: (input: {
    inventoryItemId: string;
    inventoryLotId?: string;
    eventId: string;
    ingredientId: string;
    quantity: number;
    idempotencyKey?: string;
  }) => Promise<{ docId: string }>;
  releaseReservation?: (input: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
};

type ItemAvailability = {
  item: EventStockItem;
  available: number;
};

type LotAvailability = {
  lot: EventStockLot;
  available: number;
};

type DemandTarget = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number;
};

/**
 * Allocates and reconciles InventoryReservation rows for an event's demand.
 * Consumed holds are never released; active holds move toward
 * max(0, demand − consumed).
 */
export class EventStockReservationCoordinator {
  constructor(private readonly ports: Ports) {}

  /** Top-up only: reserve remaining demand against available stock. */
  async allocate(input: {
    eventId: string;
    demands: readonly EventStockDemand[];
    items: readonly EventStockItem[];
    reservations: readonly EventStockReservation[];
    lots?: readonly EventStockLot[];
  }) {
    const availability = this.itemAvailability(input.items, input.reservations);
    const lotAvailability = this.lotAvailability(
      input.lots,
      input.reservations,
    );
    const created: EventStockReservationCreated[] = [];
    const shortages: EventStockShortage[] = [];
    const eventReservations = input.reservations.filter(
      (reservation) =>
        reservation.eventId === input.eventId &&
        reservation.deletedAt == null &&
        (reservation.status === "active" || reservation.status === "consumed"),
    );

    for (const demand of this.openDemands(input.eventId, input.demands)) {
      const alreadyReserved = this.sumReserved(
        eventReservations,
        demand.ingredientId,
      );
      const need = Math.max(0, demand.requiredQuantity - alreadyReserved);
      if (need <= 0) continue;

      const topUp = await this.reserveNeed({
        eventId: input.eventId,
        ingredientId: demand.ingredientId,
        unit: demand.unit,
        need,
        alreadyActive: alreadyReserved,
        availability,
        lotAvailability,
      });
      created.push(...topUp.created);
      if (topUp.shortfall > 0) {
        shortages.push({
          ingredientId: demand.ingredientId,
          unit: demand.unit,
          requiredQuantity: demand.requiredQuantity,
          reservedQuantity: alreadyReserved + topUp.reserved,
          shortageQuantity: topUp.shortfall,
        });
      }
    }

    return { created, shortages };
  }

  /**
   * After EventDish demand changes: top up, release excess active holds, or
   * clear active holds when demand is gone. No-ops when the event has no
   * prior active/consumed reservations.
   */
  async reconcile(input: {
    eventId: string;
    demands: readonly EventStockDemand[];
    items: readonly EventStockItem[];
    reservations: readonly EventStockReservation[];
    lots?: readonly EventStockLot[];
  }) {
    const release = this.ports.releaseReservation;
    if (!release) {
      throw new Error(
        "EventStockReservationCoordinator.reconcile requires releaseReservation",
      );
    }

    const eventReservations = input.reservations.filter(
      (reservation) =>
        reservation.eventId === input.eventId &&
        reservation.deletedAt == null &&
        (reservation.status === "active" || reservation.status === "consumed"),
    );
    if (eventReservations.length === 0) {
      return { created: [], released: [], shortages: [] };
    }

    const availability = this.itemAvailability(input.items, input.reservations);
    const lotAvailability = this.lotAvailability(
      input.lots,
      input.reservations,
    );
    const mutableReservations = eventReservations.map((row) => ({ ...row }));
    const created: EventStockReservationCreated[] = [];
    const released: EventStockReservationReleased[] = [];
    const shortages: EventStockShortage[] = [];
    const targets = this.demandTargets(input.eventId, input.demands);
    const ingredientIds = new Set<string>([
      ...targets.keys(),
      ...mutableReservations.map((row) => row.ingredientId),
    ]);

    for (const ingredientId of ingredientIds) {
      const target = targets.get(ingredientId) ?? {
        ingredientId,
        unit: this.unitForIngredient(
          ingredientId,
          input.items,
          mutableReservations,
        ),
        requiredQuantity: 0,
      };
      const consumed = this.sumByStatus(
        mutableReservations,
        ingredientId,
        "consumed",
      );
      const activeRows = mutableReservations
        .filter(
          (row) => row.ingredientId === ingredientId && row.status === "active",
        )
        .sort((left, right) => left.quantity - right.quantity);
      const currentActive = activeRows.reduce(
        (sum, row) => sum + row.quantity,
        0,
      );
      // Never pull total held below what was already consumed.
      const targetActive = Math.max(0, target.requiredQuantity - consumed);

      if (targetActive < currentActive) {
        const releaseResult = await this.releaseExcess({
          eventId: input.eventId,
          ingredientId,
          unit: target.unit,
          excess: currentActive - targetActive,
          activeRows,
          availability,
          lotAvailability,
          release,
        });
        released.push(...releaseResult.released);
        created.push(...releaseResult.recreated);
        for (const row of releaseResult.released) {
          const match = mutableReservations.find(
            (reservation) => reservation.id === row.reservationId,
          );
          if (match) match.status = "released";
        }
      } else if (targetActive > currentActive) {
        const need = targetActive - currentActive;
        const topUp = await this.reserveNeed({
          eventId: input.eventId,
          ingredientId,
          unit: target.unit,
          need,
          alreadyActive: currentActive,
          availability,
          lotAvailability,
        });
        created.push(...topUp.created);
        if (topUp.shortfall > 0) {
          shortages.push({
            ingredientId,
            unit: target.unit,
            requiredQuantity: target.requiredQuantity,
            reservedQuantity: consumed + currentActive + topUp.reserved,
            shortageQuantity: topUp.shortfall,
          });
        }
      }
    }

    return { created, released, shortages };
  }

  private openDemands(eventId: string, demands: readonly EventStockDemand[]) {
    return demands.filter(
      (demand) =>
        demand.eventId === eventId &&
        (demand.status === "calculated" || demand.status === "confirmed") &&
        demand.requiredQuantity > 0,
    );
  }

  private demandTargets(eventId: string, demands: readonly EventStockDemand[]) {
    const targets = new Map<string, DemandTarget>();
    for (const demand of this.openDemands(eventId, demands)) {
      const existing = targets.get(demand.ingredientId);
      if (existing) {
        existing.requiredQuantity += demand.requiredQuantity;
        continue;
      }
      targets.set(demand.ingredientId, {
        ingredientId: demand.ingredientId,
        unit: demand.unit,
        requiredQuantity: demand.requiredQuantity,
      });
    }
    return targets;
  }

  private async releaseExcess(input: {
    eventId: string;
    ingredientId: string;
    unit: string;
    excess: number;
    activeRows: EventStockReservation[];
    availability: ItemAvailability[];
    lotAvailability: LotAvailability[] | null;
    release: NonNullable<Ports["releaseReservation"]>;
  }) {
    const released: EventStockReservationReleased[] = [];
    const recreated: EventStockReservationCreated[] = [];
    let remaining = input.excess;

    for (const row of input.activeRows) {
      if (remaining <= 0) break;
      if (row.status !== "active") continue;

      await input.release({
        docId: row.id,
        version: row.version ?? 0,
        reason: "Event menu demand decreased",
      });
      released.push({
        reservationId: row.id,
        ingredientId: input.ingredientId,
        quantity: row.quantity,
      });
      const entry = input.availability.find(
        (candidate) => candidate.item.id === row.inventoryItemId,
      );
      if (entry) entry.available += row.quantity;
      const lotEntry = row.inventoryLotId
        ? input.lotAvailability?.find(
            (candidate) => candidate.lot.id === row.inventoryLotId,
          )
        : undefined;
      if (lotEntry) lotEntry.available += row.quantity;

      if (row.quantity <= remaining) {
        remaining -= row.quantity;
        row.status = "released";
        continue;
      }

      // Partial excess on this row: keep the unneeded portion reserved.
      const keep = row.quantity - remaining;
      remaining = 0;
      row.status = "released";
      if (keep > 0) {
        await this.ports.createReservation({
          inventoryItemId: row.inventoryItemId,
          ...(row.inventoryLotId ? { inventoryLotId: row.inventoryLotId } : {}),
          eventId: input.eventId,
          ingredientId: input.ingredientId,
          quantity: keep,
          idempotencyKey: `event-stock-keep:${input.eventId}:${row.id}:${keep}`,
        });
        if (entry) entry.available -= keep;
        if (lotEntry) lotEntry.available -= keep;
        recreated.push({
          inventoryItemId: row.inventoryItemId,
          ...(row.inventoryLotId ? { inventoryLotId: row.inventoryLotId } : {}),
          ingredientId: input.ingredientId,
          quantity: keep,
          unit: input.unit,
        });
      }
    }

    return { released, recreated };
  }

  private async reserveNeed(input: {
    eventId: string;
    ingredientId: string;
    unit: string;
    need: number;
    alreadyActive: number;
    availability: ItemAvailability[];
    lotAvailability: LotAvailability[] | null;
  }) {
    const created: EventStockReservationCreated[] = [];
    let remaining = input.need;
    let reserved = 0;
    const candidates = input.availability
      .filter(
        (entry) =>
          entry.item.ingredientId === input.ingredientId &&
          entry.item.unit === input.unit &&
          entry.available > 0,
      )
      .sort((left, right) => right.available - left.available);

    if (input.lotAvailability) {
      const lotCandidates = input.lotAvailability
        .filter(
          (candidate) =>
            candidate.lot.ingredientId === input.ingredientId &&
            candidate.available > 0 &&
            candidates.some(
              (entry) => entry.item.locationId === candidate.lot.locationId,
            ),
        )
        .sort(
          (left, right) =>
            (left.lot.receivedAt ?? Number.MAX_SAFE_INTEGER) -
              (right.lot.receivedAt ?? Number.MAX_SAFE_INTEGER) ||
            left.lot.id.localeCompare(right.lot.id),
        );

      for (const candidate of lotCandidates) {
        if (remaining <= 0) break;
        const entry = candidates.find(
          (item) => item.item.locationId === candidate.lot.locationId,
        );
        if (!entry || entry.available <= 0) continue;
        const quantity = Math.min(
          remaining,
          entry.available,
          candidate.available,
        );
        if (quantity <= 0) continue;
        await this.ports.createReservation({
          inventoryItemId: entry.item.id,
          inventoryLotId: candidate.lot.id,
          eventId: input.eventId,
          ingredientId: input.ingredientId,
          quantity,
          idempotencyKey: `event-stock-reserve:${input.eventId}:${entry.item.id}:${candidate.lot.id}:${input.ingredientId}:${quantity}:${input.alreadyActive + reserved}`,
        });
        entry.available -= quantity;
        candidate.available -= quantity;
        remaining -= quantity;
        reserved += quantity;
        created.push({
          inventoryItemId: entry.item.id,
          inventoryLotId: candidate.lot.id,
          ingredientId: input.ingredientId,
          quantity,
          unit: input.unit,
        });
      }
    }

    for (const entry of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, entry.available);
      if (quantity <= 0) continue;
      await this.ports.createReservation({
        inventoryItemId: entry.item.id,
        eventId: input.eventId,
        ingredientId: input.ingredientId,
        quantity,
        idempotencyKey: `event-stock-reserve:${input.eventId}:${entry.item.id}:${input.ingredientId}:${quantity}:${input.alreadyActive + reserved}`,
      });
      entry.available -= quantity;
      remaining -= quantity;
      reserved += quantity;
      created.push({
        inventoryItemId: entry.item.id,
        ingredientId: input.ingredientId,
        quantity,
        unit: input.unit,
      });
    }

    return { created, reserved, shortfall: remaining };
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

  private lotAvailability(
    lots: readonly EventStockLot[] | undefined,
    reservations: readonly EventStockReservation[],
  ): LotAvailability[] | null {
    if (!lots) return null;
    return lots
      .filter((lot) => lot.deletedAt == null && lot.receiptQuantity > 0)
      .map((lot) => {
        const allocated = reservations
          .filter(
            (reservation) =>
              reservation.inventoryLotId === lot.id &&
              reservation.deletedAt == null &&
              (reservation.status === "active" ||
                reservation.status === "consumed"),
          )
          .reduce((sum, reservation) => sum + reservation.quantity, 0);
        return {
          lot,
          available: Math.max(0, lot.receiptQuantity - allocated),
        };
      });
  }

  private sumReserved(
    reservations: readonly EventStockReservation[],
    ingredientId: string,
  ) {
    return reservations
      .filter(
        (reservation) =>
          reservation.ingredientId === ingredientId &&
          (reservation.status === "active" ||
            reservation.status === "consumed"),
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
  }

  private sumByStatus(
    reservations: readonly EventStockReservation[],
    ingredientId: string,
    status: string,
  ) {
    return reservations
      .filter(
        (reservation) =>
          reservation.ingredientId === ingredientId &&
          reservation.status === status,
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);
  }

  private unitForIngredient(
    ingredientId: string,
    items: readonly EventStockItem[],
    reservations: readonly EventStockReservation[],
  ) {
    const reservation = reservations.find(
      (row) => row.ingredientId === ingredientId,
    );
    if (reservation) {
      const item = items.find((row) => row.id === reservation.inventoryItemId);
      if (item) return item.unit;
    }
    const item = items.find((row) => row.ingredientId === ingredientId);
    return item?.unit ?? "each";
  }
}
