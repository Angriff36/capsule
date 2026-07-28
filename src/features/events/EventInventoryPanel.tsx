import { useMemo, useState } from "react";
import {
  useCreateInventoryReservation,
  useIngredientDemandConfirm,
  useIngredientDemandFulfill,
  useInventoryReservationConsume,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { StatusChip } from "../../ui/primitives";
import { EventStockIssueCoordinator } from "./EventStockIssueCoordinator";
import {
  EventStockReservationCoordinator,
  type EventStockReservationCreated,
  type EventStockShortage,
} from "./EventStockReservationCoordinator";

type Props = {
  eventId: string;
  eventStage: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown | null) => void;
};

const ELIGIBLE_STAGES = new Set(["approved", "executing"]);

export function EventInventoryPanel({
  eventId,
  eventStage,
  busy,
  onBusy,
  onError,
}: Props) {
  const demands = useListIngredientDemand();
  const items = useListInventoryItem();
  const inventoryLots = useListInventoryLot();
  const reservations = useListInventoryReservation();
  const ingredients = useListIngredient();
  const locations = useListStorageLocation();
  const createReservation = useCreateInventoryReservation();
  const consumeReservation = useInventoryReservationConsume();
  const confirmDemand = useIngredientDemandConfirm();
  const fulfillDemand = useIngredientDemandFulfill();
  const [created, setCreated] = useState<EventStockReservationCreated[]>([]);
  const [shortages, setShortages] = useState<EventStockShortage[]>([]);
  const [ran, setRan] = useState(false);
  const [lastIssue, setLastIssue] = useState<string | null>(null);

  const eligible = ELIGIBLE_STAGES.has(eventStage);
  const eventDemands = useMemo(
    () =>
      (demands ?? []).filter(
        (demand) =>
          demand.eventId === eventId &&
          demand.deletedAt == null &&
          demand.status !== "superseded",
      ),
    [demands, eventId],
  );
  const eventReservations = useMemo(
    () =>
      (reservations ?? []).filter(
        (reservation) =>
          reservation.eventId === eventId &&
          reservation.deletedAt == null &&
          (reservation.status === "active" ||
            reservation.status === "consumed"),
      ),
    [reservations, eventId],
  );
  const activeReservations = eventReservations.filter(
    (reservation) => reservation.status === "active",
  );

  const ingredientName = (ingredientId: string) =>
    ingredients?.find((ingredient) => ingredient._id === ingredientId)?.name ??
    ingredientId;
  const locationName = (inventoryItemId: string) => {
    const item = items?.find((row) => row._id === inventoryItemId);
    if (!item) return "—";
    return (
      locations?.find((location) => location._id === item.locationId)?.name ??
      item.locationId
    );
  };
  const lotNumber = (inventoryLotId?: string | null) =>
    inventoryLotId
      ? (inventoryLots?.find((lot) => lot._id === inventoryLotId)
          ?.supplierLotNumber ?? "Unknown lot")
      : "Unattributed";

  const reserveStock = () => {
    if (
      !eligible ||
      demands === undefined ||
      items === undefined ||
      inventoryLots === undefined ||
      reservations === undefined
    ) {
      return;
    }
    onBusy(true);
    onError(null);
    void (async () => {
      try {
        const result = await new EventStockReservationCoordinator({
          createReservation: async (input) => {
            const doc = (await createReservation(input)) as { docId: string };
            return { docId: doc.docId };
          },
        }).allocate({
          eventId,
          demands: eventDemands.map((demand) => ({
            id: demand._id,
            eventId: demand.eventId,
            ingredientId: demand.ingredientId,
            requiredQuantity: Number(demand.requiredQuantity),
            unit: String(demand.unit),
            status: String(demand.status),
          })),
          items: (items ?? []).map((item) => ({
            id: item._id,
            ingredientId: item.ingredientId,
            locationId: item.locationId,
            quantityOnHand: Number(item.quantityOnHand),
            unit: String(item.unit),
            stockedAt: item.stockedAt,
            deletedAt: item.deletedAt,
          })),
          reservations: (reservations ?? []).map((reservation) => ({
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
          lots: inventoryLots.map((lot) => ({
            id: lot._id,
            ingredientId: lot.ingredientId,
            locationId: lot.locationId,
            receiptQuantity: Number(lot.receiptQuantity),
            receivedAt: lot.receivedAt,
            deletedAt: lot.deletedAt,
          })),
        });
        setCreated(result.created);
        setShortages(result.shortages);
        setRan(true);
      } catch (error) {
        onError(error);
      } finally {
        onBusy(false);
      }
    })();
  };

  const issueStock = (reservationId: string) => {
    if (
      !eligible ||
      demands === undefined ||
      items === undefined ||
      reservations === undefined
    ) {
      return;
    }
    onBusy(true);
    onError(null);
    void (async () => {
      try {
        const result = await new EventStockIssueCoordinator({
          consumeReservation: (input) => consumeReservation(input),
          confirmDemand: (input) => confirmDemand(input),
          fulfillDemand: (input) => fulfillDemand(input),
        }).issue({
          eventId,
          reservationId,
          reservations: (reservations ?? []).map((reservation) => ({
            id: reservation._id,
            inventoryItemId: reservation.inventoryItemId,
            eventId: reservation.eventId,
            ingredientId: reservation.ingredientId,
            quantity: Number(reservation.quantity),
            status: String(reservation.status),
            version: reservation.version,
            deletedAt: reservation.deletedAt,
          })),
          demands: eventDemands.map((demand) => ({
            id: demand._id,
            eventId: demand.eventId,
            ingredientId: demand.ingredientId,
            requiredQuantity: Number(demand.requiredQuantity),
            unit: String(demand.unit),
            status: String(demand.status),
            version: demand.version,
            deletedAt: demand.deletedAt,
          })),
          items: (items ?? []).map((item) => ({
            id: item._id,
            quantityOnHand: Number(item.quantityOnHand),
            locationId: item.locationId,
            unit: String(item.unit),
            useByAt: item.useByAt,
          })),
        });
        setLastIssue(
          result.fulfilledDemandId
            ? `Issued ${result.consumedQuantity}; demand fulfilled.`
            : `Issued ${result.consumedQuantity}; demand still open (${result.consumedForIngredient} consumed so far).`,
        );
      } catch (error) {
        onError(error);
      } finally {
        onBusy(false);
      }
    })();
  };

  if (
    !eligible &&
    eventDemands.length === 0 &&
    eventReservations.length === 0
  ) {
    return null;
  }

  return (
    <section className="card space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2 className="text-[15px] font-semibold text-ink">
            Stock reservations
          </h2>
          <p className="mt-1 text-[12px] text-ink-3">
            Reserve available stock, then issue holds when product leaves
            storage for the event.
          </p>
        </div>
        {eligible ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy ||
              demands === undefined ||
              items === undefined ||
              inventoryLots === undefined ||
              reservations === undefined ||
              eventDemands.length === 0
            }
            onClick={reserveStock}
          >
            Reserve stock
          </button>
        ) : (
          <p className="text-[12px] text-ink-3">
            Approve the event to reserve stock.
          </p>
        )}
      </div>

      {eventDemands.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          No ingredient demand rows for this event yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-3">
              <tr>
                <th className="py-1 pr-3 font-medium">Ingredient</th>
                <th className="py-1 pr-3 font-medium">Need</th>
                <th className="py-1 pr-3 font-medium">Reserved</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {eventDemands.map((demand) => {
                const reserved = activeReservations
                  .filter(
                    (reservation) =>
                      reservation.ingredientId === demand.ingredientId,
                  )
                  .reduce(
                    (sum, reservation) => sum + Number(reservation.quantity),
                    0,
                  );
                return (
                  <tr key={demand._id} className="border-t border-line/60">
                    <td className="py-2 pr-3">
                      {ingredientName(demand.ingredientId)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {Number(demand.requiredQuantity)} {String(demand.unit)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {reserved} {String(demand.unit)}
                    </td>
                    <td className="py-2">
                      <StatusChip status={String(demand.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {eventReservations.length > 0 ? (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <p className="text-[12px] font-medium text-ink">Event holds</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-medium">Ingredient</th>
                  <th className="py-1 pr-3 font-medium">Location</th>
                  <th className="py-1 pr-3 font-medium">Supplier lot</th>
                  <th className="py-1 pr-3 font-medium">Qty</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {eventReservations.map((reservation) => (
                  <tr key={reservation._id} className="border-t border-line/60">
                    <td className="py-2 pr-3">
                      {ingredientName(reservation.ingredientId)}
                    </td>
                    <td className="py-2 pr-3">
                      {locationName(reservation.inventoryItemId)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {lotNumber(reservation.inventoryLotId)}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {Number(reservation.quantity)}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusChip status={String(reservation.status)} />
                    </td>
                    <td className="py-2">
                      {eligible && reservation.status === "active" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={
                            busy ||
                            items === undefined ||
                            reservations === undefined
                          }
                          onClick={() => issueStock(reservation._id)}
                        >
                          Issue stock
                        </button>
                      ) : (
                        <span className="text-[12px] text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lastIssue ? (
            <p className="text-[12px] text-ink-2">{lastIssue}</p>
          ) : null}
        </div>
      ) : null}

      {ran ? (
        <div className="space-y-2 border-t border-line/60 pt-3 text-[13px]">
          {created.length === 0 && shortages.length === 0 ? (
            <p className="text-ink-2">
              Nothing new to reserve — demand is already covered by active
              holds.
            </p>
          ) : null}
          {created.length > 0 ? (
            <div>
              <p className="font-medium text-ink">Reserved this run</p>
              <ul className="mt-1 list-disc pl-5 text-ink-2">
                {created.map((row) => (
                  <li key={`${row.inventoryItemId}:${row.quantity}`}>
                    {ingredientName(row.ingredientId)}: {row.quantity}{" "}
                    {row.unit}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {shortages.length > 0 ? (
            <div>
              <p className="font-medium text-danger">Shortages</p>
              <ul className="mt-1 list-disc pl-5 text-ink-2">
                {shortages.map((row) => (
                  <li key={`${row.ingredientId}:${row.unit}`}>
                    {ingredientName(row.ingredientId)}: short{" "}
                    {row.shortageQuantity} {row.unit} (need{" "}
                    {row.requiredQuantity}, held {row.reservedQuantity})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
