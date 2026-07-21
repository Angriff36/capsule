import { useMemo, useState } from "react";
import {
  useCreateInventoryReservation,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryReservation,
} from "../../lib/manifest-convex-react";
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
  const reservations = useListInventoryReservation();
  const ingredients = useListIngredient();
  const createReservation = useCreateInventoryReservation();
  const [created, setCreated] = useState<EventStockReservationCreated[]>([]);
  const [shortages, setShortages] = useState<EventStockShortage[]>([]);
  const [ran, setRan] = useState(false);

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
          reservation.status === "active",
      ),
    [reservations, eventId],
  );

  const ingredientName = (ingredientId: string) =>
    ingredients?.find((ingredient) => ingredient._id === ingredientId)?.name ??
    ingredientId;

  const reserveStock = () => {
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
            quantityOnHand: Number(item.quantityOnHand),
            unit: String(item.unit),
            stockedAt: item.stockedAt,
            deletedAt: item.deletedAt,
          })),
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
            Reserve available stock against this event&apos;s ingredient demand.
            Shortages stay visible for purchasing follow-up.
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
                const reserved = eventReservations
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
                    <td className="py-2">{String(demand.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
