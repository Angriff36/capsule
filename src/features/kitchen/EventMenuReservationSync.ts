import {
  EventStockReservationCoordinator,
  type EventStockDemand,
  type EventStockItem,
  type EventStockLot,
  type EventStockReservation,
  type EventStockShortage,
} from "../events/EventStockReservationCoordinator";

type DemandTarget = {
  eventId: string;
  ingredientId: string;
  unit: string;
  requiredQuantity: number;
  status: string;
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
  releaseReservation: (input: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
};

/**
 * After EventDish demand reconciliation, aligns active inventory holds to the
 * fresh demand targets when the event already has reservations.
 */
export class EventMenuReservationSync {
  constructor(private readonly ports: Ports) {}

  async afterDemandChange(input: {
    eventId: string;
    demandTargets: readonly DemandTarget[];
    items: readonly EventStockItem[];
    lots: readonly EventStockLot[];
    reservations: readonly EventStockReservation[];
  }): Promise<{ shortages: EventStockShortage[] }> {
    const demands: EventStockDemand[] = input.demandTargets.map(
      (target, index) => ({
        id: `demand-target:${target.ingredientId}:${target.unit}:${index}`,
        eventId: target.eventId,
        ingredientId: target.ingredientId,
        requiredQuantity: target.requiredQuantity,
        unit: target.unit,
        status: target.status,
      }),
    );
    const result = await new EventStockReservationCoordinator(
      this.ports,
    ).reconcile({
      eventId: input.eventId,
      demands,
      items: input.items,
      lots: input.lots,
      reservations: input.reservations,
    });
    return { shortages: result.shortages };
  }
}
