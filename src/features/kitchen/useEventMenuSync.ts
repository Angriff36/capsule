import { useCallback, useMemo } from "react";
import type { Id } from "../../lib/api";
import { useReconcileEventPrepWork } from "../../lib/safeCulinaryOperations";
import {
  useCreateInventoryReservation,
  useInventoryReservationRelease,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
} from "../../lib/manifest-convex-react";
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
 */
export function useEventMenuSync() {
  const demands = useListIngredientDemand();
  const inventoryItems = useListInventoryItem();
  const inventoryLots = useListInventoryLot();
  const inventoryReservations = useListInventoryReservation();
  const reconcilePrep = useReconcileEventPrepWork();
  const createReservation = useCreateInventoryReservation();
  const releaseReservation = useInventoryReservationRelease();

  const ready =
    demands !== undefined &&
    inventoryItems !== undefined &&
    inventoryLots !== undefined &&
    inventoryReservations !== undefined;

  const demandVersionsForEvent = useCallback(
    (eventId: string) =>
      Object.fromEntries(
        (demands ?? [])
          .filter((row) => row.eventId === eventId && row.deletedAt == null)
          .map((row) => [String(row._id), Number(row.version)]),
      ),
    [demands],
  );

  const controller = useMemo(() => {
    if (!ready) return null;
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
        demands: demands as never,
        inventoryItems: inventoryItems as never,
        inventoryLots: inventoryLots as never,
        inventoryReservations: inventoryReservations as never,
      }),
    );
  }, [
    createReservation,
    demands,
    inventoryItems,
    inventoryLots,
    inventoryReservations,
    ready,
    releaseReservation,
    reconcilePrep,
  ]);

  return {
    ready,
    demandVersionsForEvent,
    // Adding a dish and changing servings also reconcile on the server. Manual
    // sync uses the same current-state transaction and is safe to repeat.
    syncPrepForDish: async (target: EventDishSyncTarget) => {
      if (!controller) {
        throw new Error("Stock sync catalogs are still loading");
      }
      return controller.syncPrepForDish(target);
    },
    // Stock shortages only — no prep-task materialization. This is what a
    // just-created event dish needs.
    syncStockForEvent: async (
      eventId: string,
    ): Promise<EventStockShortage[]> => {
      if (!controller) {
        throw new Error("Stock sync catalogs are still loading");
      }
      return controller.syncComponentDemands(eventId);
    },
  };
}
