import { useMemo, useState } from "react";
import { type Id } from "../../lib/api";
import { useIssueEventStock } from "../../lib/operational-transactions";
import {
  useCreateInventoryReservation,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventInventorySummaryAside } from "./EventInventorySummaryAside";
import {
  EventInventoryDemandGroups,
  EventInventoryHoldsTable,
  type EventInventoryDemandRow,
  type EventInventoryHoldRow,
} from "./EventInventoryTables";
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
  const issueEventStock = useIssueEventStock();
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
  const ingredientCategory = (ingredientId: string) =>
    ingredients?.find((ingredient) => ingredient._id === ingredientId)
      ?.category ?? "";

  const demandRows: EventInventoryDemandRow[] = eventDemands.map((demand) => ({
    id: demand._id,
    ingredientName: ingredientName(demand.ingredientId),
    category: String(ingredientCategory(demand.ingredientId) ?? ""),
    required: Number(demand.requiredQuantity),
    reserved: activeReservations
      .filter((reservation) => reservation.ingredientId === demand.ingredientId)
      .reduce((sum, reservation) => sum + Number(reservation.quantity), 0),
    unit: String(demand.unit),
    status: String(demand.status),
  }));

  const holdRows: EventInventoryHoldRow[] = eventReservations.map(
    (reservation) => ({
      id: reservation._id,
      ingredientName: ingredientName(reservation.ingredientId),
      location: locationName(reservation.inventoryItemId),
      lot: lotNumber(reservation.inventoryLotId),
      quantity: Number(reservation.quantity),
      status: String(reservation.status),
      canIssue: eligible && reservation.status === "active",
    }),
  );

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
        const reservation = reservations.find(
          (row) => row._id === reservationId,
        );
        if (!reservation)
          throw new Error("Reservation not found for this event");
        const result = await issueEventStock({
          eventId: eventId as Id<"events">,
          reservationId: reservation._id,
          reservationVersion: reservation.version,
          operationKey: `event-stock-issue:${reservation._id}`,
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
    return (
      <section className="card space-y-2 px-4 py-3.5">
        <p className="eyebrow">Inventory</p>
        <h2 className="font-display text-xl text-ink">Stock reservations</h2>
        <p className="text-base text-ink-2">
          Nothing to reserve yet. Add dishes on the Menu tab to create
          ingredient demand, then approve the event to reserve stock against it.
          Planning events can still draft a PO from needs once demand exists.
        </p>
        <EventDraftPoButton eventId={eventId} eventStage={eventStage} />
      </section>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl leading-none text-ink">
                Event inventory &amp; supplies
              </h2>
              <p className="mt-1.5 text-base text-ink-2">
                {demandRows.length} demand line
                {demandRows.length === 1 ? "" : "s"} ·{" "}
                {holdRows.filter((row) => row.status === "active").length}{" "}
                active hold
                {holdRows.filter((row) => row.status === "active").length === 1
                  ? ""
                  : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EventDraftPoButton eventId={eventId} eventStage={eventStage} />
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
                <p className="text-base text-ink-3">
                  Approve the event to reserve stock.
                </p>
              )}
            </div>
          </div>
          <p className="mt-2.5 border-t border-line pt-2.5 text-base text-ink-3">
            Reserve available stock, then issue holds when product leaves
            storage for the event.
          </p>
        </section>

        {demandRows.length === 0 ? (
          <p className="card empty-state">
            <strong>No ingredient demand yet</strong>
            <span>
              Add dishes on the Menu tab to raise demand for this event.
            </span>
          </p>
        ) : (
          <EventInventoryDemandGroups rows={demandRows} />
        )}

        {holdRows.length > 0 ? (
          <EventInventoryHoldsTable
            rows={holdRows}
            busy={busy || items === undefined || reservations === undefined}
            onIssue={issueStock}
            lastIssue={lastIssue}
          />
        ) : null}

        {ran ? (
          <section
            className="card px-4 py-3.5"
            data-testid="event-inventory-run"
          >
            <h3 className="text-sm font-bold tracking-[0.06em] text-ink uppercase">
              Last reserve run
            </h3>
            {created.length === 0 && shortages.length === 0 ? (
              <p className="mt-2 text-base text-ink-2">
                Nothing new to reserve — demand is already covered by active
                holds.
              </p>
            ) : null}
            {created.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {created.map((row) => (
                  <li
                    key={`${row.inventoryItemId}:${row.quantity}`}
                    className="flex items-baseline justify-between gap-3 border-b border-line pb-1 last:border-b-0"
                  >
                    <span className="text-base text-ink">
                      {ingredientName(row.ingredientId)}
                    </span>
                    <span className="font-mono text-base text-ok">
                      +{row.quantity} {row.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      <EventInventorySummaryAside
        demandRows={demandRows}
        holdRows={holdRows}
        shortages={shortages}
        ingredientName={ingredientName}
      />
    </div>
  );
}
