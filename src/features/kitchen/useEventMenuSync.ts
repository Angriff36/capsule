import { useCallback } from "react";
import type { Id } from "../../lib/api";
import { useReconcileEventPrepWork } from "../../lib/safeCulinaryOperations";
import {
  useCreateInventoryReservation,
  useInventoryReservationRelease,
} from "../../lib/manifest-convex-react";
import {
  useEventDemandsIfAny,
  useEventStockLoader,
} from "../../lib/useEventAreaRows";
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
 *
 * The stock it syncs against (the event's needs, and the items, lots and
 * holds of their ingredients) is read for the one event at the moment of the
 * sync, never the company's whole stock tables. Pass the event shown to
 * watch its needs (demandVersionsForEvent); `ready` then waits for them.
 */
export function useEventMenuSync(eventId?: string) {
  const demands = useEventDemandsIfAny(eventId);
  const loadStock = useEventStockLoader();
  const reconcilePrep = useReconcileEventPrepWork();
  const createReservation = useCreateInventoryReservation();
  const releaseReservation = useInventoryReservationRelease();

  const ready = eventId === undefined || demands !== undefined;

  const demandVersionsForEvent = useCallback(
    (eventId: string) =>
      Object.fromEntries(
        (demands ?? [])
          .filter((row) => row.eventId === eventId && row.deletedAt == null)
          .map((row) => [String(row._id), Number(row.version)]),
      ),
    [demands],
  );

  const controllerFor = useCallback(
    async (eventId: string) => {
      const stock = await loadStock(eventId);
      return new EventMenuSyncController(
        {
          reconcilePrep: (eventDishId) =>
            reconcilePrep({ eventDishId: eventDishId as Id<"eventDishes"> }),
          createReservation: async (input) => {
            const doc = (await createReservation(input)) as { docId: string };
            return { docId: doc.docId };
          },
          releaseReservation: (input) => releaseReservation(input),
        },
        EventMenuSyncController.requireCatalogs({
          demands: stock.demands as never,
          inventoryItems: stock.items as never,
          inventoryLots: stock.lots as never,
          inventoryReservations: stock.reservations as never,
        }),
      );
    },
    [createReservation, loadStock, releaseReservation, reconcilePrep],
  );

  return {
    ready,
    demandVersionsForEvent,
    // Adding a dish and changing servings also reconcile on the server. Manual
    // sync uses the same current-state transaction and is safe to repeat.
    syncPrepForDish: async (target: EventDishSyncTarget) =>
      (await controllerFor(target.eventId)).syncPrepForDish(target),
    // Stock shortages only — no prep-task materialization. This is what a
    // just-created event dish needs.
    syncStockForEvent: async (eventId: string): Promise<EventStockShortage[]> =>
      (await controllerFor(eventId)).syncComponentDemands(eventId),
  };
}
