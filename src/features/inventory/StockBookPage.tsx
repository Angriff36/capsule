import { useState, type FormEvent } from "react";
import {
  useCreateInventoryItem,
  useCreateInventoryReservation,
  useCreateStockTransfer,
  useCreateStorageLocation,
  useInventoryItemReceiveStock,
  useInventoryItemRecount,
  useInventoryItemSetExpiry,
  useInventoryItemUpdateLevels,
  useInventoryReservationConsume,
  useInventoryReservationRelease,
  useListEvent,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListStockTransfer,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { StockReceiptScanner } from "./StockReceiptScanner";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";

const UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
] as const;

const policy = new SupplyLifecyclePolicy();

const DAY_MS = 86_400_000;
const HORIZON_DAYS = [3, 7, 14, 30] as const;

const isExpired = (item: any) =>
  item.useByAt != null && item.useByAt < Date.now();
const expiresWithin = (item: any, horizonDays: number) => {
  const soonest = Math.min(
    item.useByAt ?? Infinity,
    item.bestBeforeAt ?? Infinity,
  );
  return soonest !== Infinity && soonest < Date.now() + horizonDays * DAY_MS;
};
const dateLabel = formatDate;
// Date-only input, stored as end of the labeled local day so a lot stays
// issuable through its use-by date (matches the consume guard cutoff).
const toExpiryInput = (current: number | null | undefined) =>
  current == null ? "" : new Date(current).toLocaleDateString("en-CA");
const parseExpiryInput = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null; // blank clears the stored date
  const time = new Date(`${trimmed}T23:59:59.999`).getTime();
  return Number.isFinite(time) ? time : undefined; // undefined = invalid
};

export function StockBookPage() {
  const items = useListInventoryItem();
  const inventoryLots = useListInventoryLot();
  const reservations = useListInventoryReservation();
  const transfers = useListStockTransfer();
  const locations = useListStorageLocation();
  const ingredients = useListIngredient();
  const demands = useListIngredientDemand();
  const events = useListEvent();
  const createLocation = useCreateStorageLocation();
  const createItem = useCreateInventoryItem();
  const createReservation = useCreateInventoryReservation();
  const createTransfer = useCreateStockTransfer();
  const receiveStock = useInventoryItemReceiveStock();
  const recount = useInventoryItemRecount();
  const setExpiry = useInventoryItemSetExpiry();
  const updateLevels = useInventoryItemUpdateLevels();
  const consumeReservation = useInventoryReservationConsume();
  const releaseReservation = useInventoryReservationRelease();
  const [form, setForm] = useState<
    "location" | "stock" | "reserve" | "transfer" | null
  >(null);
  const [transferSource, setTransferSource] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [horizonDays, setHorizonDays] = useState(7);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeItems = (items ?? []).filter((item) => item.deletedAt == null);
  const expiringItems = activeItems
    .filter((item) => isExpired(item) || expiresWithin(item, horizonDays))
    .sort(
      (a, b) =>
        Math.min(a.useByAt ?? Infinity, a.bestBeforeAt ?? Infinity) -
        Math.min(b.useByAt ?? Infinity, b.bestBeforeAt ?? Infinity),
    );
  const activeReservations = (reservations ?? []).filter(
    (item) => item.deletedAt == null,
  );
  const ingredientName = (id: string) =>
    ingredients?.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const locationName = (id: string) =>
    locations?.find((item) => item._id === id)?.name ?? "Unknown location";
  const eventName = (id: string) =>
    events?.find((item) => item._id === id)?.title ?? "Unknown event";
  const reservedFor = (itemId: string) =>
    activeReservations
      .filter(
        (reservation) =>
          reservation.inventoryItemId === itemId &&
          reservation.status === "active",
      )
      .reduce((sum, reservation) => sum + reservation.quantity, 0);

  // decimal(12, 4) projection — trim float noise from derived quantities.
  const qty4 = (value: number) => Math.round(value * 10000) / 10000;
  const availableFor = (item: any) =>
    qty4(item.quantityOnHand - reservedFor(item._id));
  const belowPar = (item: any) =>
    item.parLevel > 0 && availableFor(item) < item.parLevel;
  const belowReorder = (item: any) =>
    item.reorderThreshold > 0 && availableFor(item) < item.reorderThreshold;
  const suggestedPurchase = (item: any) =>
    qty4(Math.max(0, item.parLevel - availableFor(item)));
  const lowStockItems = activeItems
    .filter(belowPar)
    .sort(
      (a, b) => availableFor(a) / a.parLevel - availableFor(b) / b.parLevel,
    );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = form;
    if (!current) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    void run(`create-${current}`, async () => {
      if (current === "location") {
        await createLocation({
          name: String(data.get("name") ?? "").trim(),
          locationType:
            String(data.get("locationType") ?? "").trim() || undefined,
          temperatureZone:
            String(data.get("temperatureZone") ?? "").trim() || undefined,
        });
      }
      if (current === "stock") {
        await createItem({
          ingredientId: String(data.get("ingredientId")),
          locationId: String(data.get("locationId")),
          unit: String(data.get("unit")) as (typeof UNITS)[number],
          quantityOnHand: Number(data.get("quantityOnHand")),
          parLevel: Number(data.get("parLevel")),
          reorderThreshold: Number(data.get("reorderThreshold")),
          unitCost: Number(data.get("unitCost")),
        });
      }
      if (current === "reserve") {
        const item = activeItems.find(
          (candidate) => candidate._id === String(data.get("inventoryItemId")),
        );
        if (!item) throw new Error("Select an available stock line.");
        const inventoryLotId = String(data.get("inventoryLotId") ?? "").trim();
        if (inventoryLotId) {
          const lot = inventoryLots?.find(
            (candidate) =>
              candidate._id === inventoryLotId && candidate.deletedAt == null,
          );
          if (
            !lot ||
            lot.ingredientId !== item.ingredientId ||
            lot.locationId !== item.locationId
          ) {
            throw new Error(
              "Select a supplier lot for the same ingredient and location.",
            );
          }
          const alreadyAllocated = (reservations ?? [])
            .filter(
              (reservation) =>
                reservation.inventoryLotId === inventoryLotId &&
                reservation.deletedAt == null &&
                (reservation.status === "active" ||
                  reservation.status === "consumed"),
            )
            .reduce(
              (sum, reservation) => sum + Number(reservation.quantity),
              0,
            );
          if (
            Number(data.get("quantity")) >
            Number(lot.receiptQuantity) - alreadyAllocated
          ) {
            throw new Error(
              "That supplier lot does not have enough unallocated stock.",
            );
          }
        }
        await createReservation({
          inventoryItemId: item._id,
          inventoryLotId: inventoryLotId || undefined,
          eventId: String(data.get("eventId")),
          ingredientId: item.ingredientId,
          quantity: Number(data.get("quantity")),
        });
      }
      if (current === "transfer") {
        const source = transferSource;
        const destination = activeItems.find(
          (candidate) =>
            candidate._id === String(data.get("destinationInventoryItemId")),
        );
        if (!source || !destination)
          throw new Error("Select a destination stock line.");
        const notes = String(data.get("notes") ?? "").trim();
        await createTransfer({
          sourceInventoryItemId: source._id,
          destinationInventoryItemId: destination._id,
          ingredientId: source.ingredientId,
          sourceLocationId: source.locationId,
          destinationLocationId: destination.locationId,
          quantity: Number(data.get("quantity")),
          unit: source.unit,
          notes: notes || undefined,
        });
        setTransferSource(null);
      }
      element.reset();
      setForm(null);
    });
  };

  const stockAction = (item: any, action: "receive" | "recount") => {
    void (async () => {
      const values = await prompt.askFields({
        title: action === "receive" ? "Receive stock" : "Recount stock",
        description: `${ingredientName(item.ingredientId)} at ${locationName(
          item.locationId,
        )} (${item.unit}).`,
        fields: [
          {
            name: "quantity",
            label:
              action === "receive" ? "Quantity received" : "Actual quantity",
            inputType: "number",
            required: true,
          },
        ],
        confirmLabel: action === "receive" ? "Receive" : "Save recount",
      });
      if (!values) return;
      const quantity = Number(values.quantity);
      if (
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        (action === "receive" && quantity === 0)
      )
        return;
      void run(`${item._id}:${action}`, async () => {
        const base = { docId: item._id, version: item.version };
        if (action === "receive") await receiveStock({ ...base, quantity });
        else await recount({ ...base, actualQuantity: quantity });
      });
    })();
  };

  const expiryAction = (item: any) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Set freshness dates",
        description:
          "Dates apply through the end of the labeled day. Leave a field blank to clear it.",
        fields: [
          {
            name: "bestBeforeAt",
            label: "Best before (YYYY-MM-DD)",
            defaultValue: toExpiryInput(item.bestBeforeAt),
            placeholder: "YYYY-MM-DD",
            required: false,
          },
          {
            name: "useByAt",
            label: "Use by (YYYY-MM-DD)",
            defaultValue: toExpiryInput(item.useByAt),
            placeholder: "YYYY-MM-DD",
            required: false,
          },
        ],
        confirmLabel: "Save dates",
      });
      if (!values) return;
      const bestBeforeAt = parseExpiryInput(values.bestBeforeAt ?? "");
      if (bestBeforeAt === undefined) return;
      const useByAt = parseExpiryInput(values.useByAt ?? "");
      if (useByAt === undefined) return;
      void run(`${item._id}:dates`, async () => {
        await setExpiry({
          docId: item._id,
          version: item.version,
          bestBeforeAt: bestBeforeAt ?? undefined,
          useByAt: useByAt ?? undefined,
        });
      });
    })();
  };

  const levelsAction = (item: any) => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Set PAR & reorder levels",
        description:
          "A low-stock alert appears when available stock (on hand minus active reservations) drops below PAR.",
        fields: [
          {
            name: "parLevel",
            label: `PAR level (${item.unit})`,
            defaultValue: String(item.parLevel),
            inputType: "number",
            required: true,
          },
          {
            name: "reorderThreshold",
            label: `Reorder threshold (${item.unit})`,
            defaultValue: String(item.reorderThreshold),
            inputType: "number",
            required: true,
          },
        ],
        confirmLabel: "Save levels",
      });
      if (!values) return;
      const parLevel = Number(values.parLevel);
      const reorderThreshold = Number(values.reorderThreshold);
      if (
        ![parLevel, reorderThreshold].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      )
        return;
      void run(`${item._id}:levels`, async () => {
        await updateLevels({
          docId: item._id,
          version: item.version,
          parLevel,
          reorderThreshold,
        });
      });
    })();
  };

  const reservationAction = (reservation: any, key: string) => {
    if (key === "release") {
      void (async () => {
        const reason = (
          await prompt.askReason({
            title: "Release reservation",
            description: "Return this reserved stock to available.",
            label: "Release reason",
            confirmLabel: "Release reservation",
          })
        )?.trim();
        if (!reason) return;
        void run(`${reservation._id}:${key}`, async () => {
          await releaseReservation({
            docId: reservation._id,
            version: reservation.version,
            reason,
          });
        });
      })();
      return;
    }
    void run(`${reservation._id}:${key}`, async () => {
      const args = { docId: reservation._id, version: reservation.version };
      if (key === "consume") await consumeReservation(args);
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Inventory · Stock book</p>
          <h1 className="display-title mt-2">What the house holds</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Stock by ingredient and storage location, with event reservations
            kept beside the quantity they claim.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button className="btn btn-ghost" onClick={() => setForm("location")}>
            New location
          </button>
          <button className="btn btn-ghost" onClick={() => setForm("reserve")}>
            Reserve
          </button>
          <button className="btn btn-primary" onClick={() => setForm("stock")}>
            Open stock line
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />
      <aside className="supply-degraded" role="note">
        <strong>Live stock facts</strong>
        <span>
          Available stock is what's on hand minus what's reserved for events —
          low-stock alerts and suggested purchase quantities come from those
          live totals. Search and exact decimals can be slightly imprecise.
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      <StockReceiptScanner
        items={activeItems}
        demands={demands ?? []}
        ingredients={ingredients ?? []}
        locations={locations ?? []}
        events={events ?? []}
        onReceive={async ({ item, quantity, unitCost }) => {
          await receiveStock({
            docId: item._id,
            version: item.version,
            quantity,
            unitCost,
          });
        }}
      />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Low-stock alerts</p>
            <h2>Below PAR</h2>
          </div>
          <span>{lowStockItems.length} alerts</span>
        </div>
        {items === undefined ||
        ingredients === undefined ||
        locations === undefined ? (
          <TableSkeleton rows={3} />
        ) : lowStockItems.length === 0 ? (
          <div className="document-empty">
            <p>Every stock line with a PAR level is at or above it.</p>
            <span>
              Set a PAR level on a stock line (Levels action) to get alerted
              when available stock drops below it.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Location</th>
                  <th>Available</th>
                  <th>PAR</th>
                  <th>Suggested purchase</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{ingredientName(item.ingredientId)}</strong>
                      <small>{item.unit}</small>
                    </td>
                    <td>{locationName(item.locationId)}</td>
                    <td className="supply-number">
                      {availableFor(item)}
                      {reservedFor(item._id) > 0
                        ? ` (${item.quantityOnHand} − ${qty4(reservedFor(item._id))} reserved)`
                        : ""}
                    </td>
                    <td className="supply-number">{item.parLevel}</td>
                    <td className="supply-number">
                      <strong>
                        {suggestedPurchase(item)} {item.unit}
                      </strong>
                    </td>
                    <td>
                      <StatusChip
                        status={
                          belowReorder(item) ? "reorder now" : "below par"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {form ? (
        <SupplyStockForm
          kind={form}
          items={activeItems}
          ingredients={ingredients ?? []}
          locations={locations ?? []}
          events={events ?? []}
          inventoryLots={(inventoryLots ?? []).filter(
            (lot) => lot.deletedAt == null,
          )}
          transferSource={transferSource}
          busy={busy != null}
          onSubmit={submit}
          onClose={() => {
            setForm(null);
            setTransferSource(null);
          }}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Freshness digest</p>
            <h2>Expiring soon</h2>
          </div>
          <label className="field-label">
            Horizon
            <select
              className="input"
              value={horizonDays}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
            >
              {HORIZON_DAYS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </label>
        </div>
        {expiringItems.length === 0 ? (
          <div className="document-empty">
            <p>Nothing expires within {horizonDays} days.</p>
            <span>
              Lots with a best-before or use-by date inside the horizon surface
              here daily.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Location</th>
                  <th>On hand</th>
                  <th>Best before</th>
                  <th>Use by</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {expiringItems.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{ingredientName(item.ingredientId)}</strong>
                      <small>{item.unit}</small>
                    </td>
                    <td>{locationName(item.locationId)}</td>
                    <td className="supply-number">{item.quantityOnHand}</td>
                    <td>{dateLabel(item.bestBeforeAt)}</td>
                    <td>{dateLabel(item.useByAt)}</td>
                    <td>
                      <StatusChip
                        status={isExpired(item) ? "expired" : "use soon"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Stock position</p>
            <h2>Ingredient by location</h2>
          </div>
          <span>{activeItems.length} lines</span>
        </div>
        {items === undefined ||
        ingredients === undefined ||
        locations === undefined ? (
          <TableSkeleton rows={7} />
        ) : activeItems.length === 0 ? (
          <div className="document-empty">
            <p>No stock lines are open.</p>
            <span>
              Register a location, then open the first ingredient line.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Location</th>
                  <th>On hand</th>
                  <th>Active reserved</th>
                  <th>PAR / reorder</th>
                  <th>Best before / Use by</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{ingredientName(item.ingredientId)}</strong>
                      <small>{item.unit}</small>
                    </td>
                    <td>{locationName(item.locationId)}</td>
                    <td className="supply-number">{item.quantityOnHand}</td>
                    <td className="supply-number">{reservedFor(item._id)}</td>
                    <td className="supply-number">
                      {item.parLevel} / {item.reorderThreshold}
                      {belowPar(item) ? (
                        <StatusChip
                          status={
                            belowReorder(item) ? "reorder now" : "below par"
                          }
                        />
                      ) : null}
                    </td>
                    <td>
                      {dateLabel(item.bestBeforeAt)} / {dateLabel(item.useByAt)}
                      {isExpired(item) ? <StatusChip status="expired" /> : null}
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => stockAction(item, "receive")}
                        >
                          Receive
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => stockAction(item, "recount")}
                        >
                          Recount
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => expiryAction(item)}
                        >
                          Dates
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => levelsAction(item)}
                        >
                          Levels
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => {
                            setTransferSource(item);
                            setForm("transfer");
                          }}
                        >
                          Transfer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger mt-10">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Event claims</p>
            <h2>Reservations</h2>
          </div>
          <span>{activeReservations.length} records</span>
        </div>
        {reservations === undefined || events === undefined ? (
          <TableSkeleton rows={5} />
        ) : activeReservations.length === 0 ? (
          <div className="document-empty">
            <p>No stock is reserved.</p>
            <span>
              Reserve stock for an event and it will show here, linked to that
              event.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Ingredient</th>
                  <th>Location</th>
                  <th>Quantity</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeReservations.map((reservation) => {
                  const item = activeItems.find(
                    (candidate) =>
                      candidate._id === reservation.inventoryItemId,
                  );
                  return (
                    <tr key={reservation._id}>
                      <td>{eventName(reservation.eventId)}</td>
                      <td>{ingredientName(reservation.ingredientId)}</td>
                      <td>
                        {item
                          ? locationName(item.locationId)
                          : "Unknown location"}
                      </td>
                      <td className="supply-number">{reservation.quantity}</td>
                      <td>
                        <StatusChip status={String(reservation.status)} />
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          {policy
                            .reservationActions(String(reservation.status))
                            // Generated consume guards use-by expiry; do not
                            // offer an action that can never succeed.
                            .filter(
                              (action) =>
                                action.key !== "consume" ||
                                item == null ||
                                !isExpired(item),
                            )
                            .map((action) => (
                              <button
                                key={action.key}
                                className="btn btn-ghost btn-sm"
                                disabled={busy != null}
                                onClick={() =>
                                  reservationAction(reservation, action.key)
                                }
                              >
                                {busy === `${reservation._id}:${action.key}`
                                  ? "Working…"
                                  : action.label}
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger mt-10">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Movement audit</p>
            <h2>Transfer history</h2>
          </div>
          <span>{(transfers ?? []).length} transfers</span>
        </div>
        {transfers === undefined ? (
          <TableSkeleton rows={3} />
        ) : transfers.length === 0 ? (
          <div className="document-empty">
            <p>No stock has moved between locations.</p>
            <span>
              Each transfer keeps its debit and credit ledger entries beside the
              durable record shown here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Ingredient</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Quantity</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...transfers]
                  .sort(
                    (a, b) => (b.transferredAt ?? 0) - (a.transferredAt ?? 0),
                  )
                  .map((transfer) => (
                    <tr key={transfer._id}>
                      <td>{dateLabel(transfer.transferredAt)}</td>
                      <td>
                        <strong>{ingredientName(transfer.ingredientId)}</strong>
                        <small>{transfer.unit}</small>
                      </td>
                      <td>{locationName(transfer.sourceLocationId)}</td>
                      <td>{locationName(transfer.destinationLocationId)}</td>
                      <td className="supply-number">{transfer.quantity}</td>
                      <td>{transfer.notes ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SupplyStockForm({
  kind,
  items,
  ingredients,
  locations,
  events,
  inventoryLots,
  transferSource,
  busy,
  onSubmit,
  onClose,
}: any) {
  const transferDestinations =
    kind === "transfer" && transferSource
      ? items.filter(
          (item: any) =>
            item._id !== transferSource._id &&
            item.ingredientId === transferSource.ingredientId &&
            item.unit === transferSource.unit,
        )
      : [];
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2>
            {kind === "location"
              ? "Register storage"
              : kind === "stock"
                ? "Open stock line"
                : kind === "transfer"
                  ? "Transfer between locations"
                  : "Reserve for event"}
          </h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : "Apply"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        {kind === "location" ? (
          <>
            <label className="field-label">
              Name
              <input name="name" className="input" required autoFocus />
            </label>
            <label className="field-label">
              Location type
              <input name="locationType" className="input" />
            </label>
            <label className="field-label">
              Temperature zone
              <input name="temperatureZone" className="input" />
            </label>
          </>
        ) : null}
        {kind === "stock" ? (
          <>
            <label className="field-label">
              Ingredient
              <select name="ingredientId" className="input" required>
                <option value="">Select ingredient</option>
                {ingredients
                  .filter(
                    (item: any) =>
                      item.deletedAt == null && item.status === "active",
                  )
                  .map((item: any) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Location
              <select name="locationId" className="input" required>
                <option value="">Select location</option>
                {locations
                  .filter(
                    (item: any) =>
                      item.deletedAt == null && item.status === "active",
                  )
                  .map((item: any) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Unit
              <select name="unit" className="input">
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            {["quantityOnHand", "parLevel", "reorderThreshold", "unitCost"].map(
              (name) => (
                <label key={name} className="field-label">
                  {
                    (
                      {
                        quantityOnHand: "Opening quantity",
                        parLevel: "PAR level",
                        reorderThreshold: "Reorder threshold",
                        unitCost: "Unit cost",
                      } as Record<string, string>
                    )[name]
                  }
                  <input
                    name={name}
                    className="input"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={0}
                    required
                  />
                </label>
              ),
            )}
          </>
        ) : null}
        {kind === "transfer" && transferSource ? (
          <>
            <label className="field-label">
              From
              <input
                className="input"
                value={`${
                  ingredients.find(
                    (ingredient: any) =>
                      ingredient._id === transferSource.ingredientId,
                  )?.name ?? "Ingredient"
                } · ${
                  locations.find(
                    (location: any) =>
                      location._id === transferSource.locationId,
                  )?.name ?? "Location"
                } (${transferSource.quantityOnHand} ${transferSource.unit} on hand)`}
                readOnly
              />
            </label>
            <label className="field-label">
              To stock line
              <select
                name="destinationInventoryItemId"
                className="input"
                required
              >
                <option value="">Select destination</option>
                {transferDestinations.map((item: any) => (
                  <option key={item._id} value={item._id}>
                    {locations.find(
                      (location: any) => location._id === item.locationId,
                    )?.name ?? "Location"}{" "}
                    ({item.quantityOnHand} {item.unit} on hand)
                  </option>
                ))}
              </select>
            </label>
            {transferDestinations.length === 0 ? (
              <p className="field-label">
                No other stock line holds this ingredient. Open a stock line at
                the destination location first.
              </p>
            ) : null}
            <label className="field-label">
              Quantity
              <input
                name="quantity"
                className="input"
                type="number"
                min={0.0001}
                max={transferSource.quantityOnHand}
                step="any"
                required
              />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </>
        ) : null}
        {kind === "reserve" ? (
          <>
            <label className="field-label">
              Stock line
              <select name="inventoryItemId" className="input" required>
                <option value="">Select stock</option>
                {items.map((item: any) => (
                  <option key={item._id} value={item._id}>
                    {ingredients.find(
                      (ingredient: any) => ingredient._id === item.ingredientId,
                    )?.name ?? "Ingredient"}{" "}
                    ·{" "}
                    {locations.find(
                      (location: any) => location._id === item.locationId,
                    )?.name ?? "Location"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Event
              <select name="eventId" className="input" required>
                <option value="">Select event</option>
                {events
                  .filter((item: any) => item.deletedAt == null)
                  .map((item: any) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Supplier lot
              <select name="inventoryLotId" className="input">
                <option value="">Unattributed / legacy stock</option>
                {inventoryLots.map((lot: any) => (
                  <option key={lot._id} value={lot._id}>
                    {lot.supplierLotNumber} ·{" "}
                    {ingredients.find(
                      (ingredient: any) => ingredient._id === lot.ingredientId,
                    )?.name ?? "Ingredient"}{" "}
                    ·{" "}
                    {locations.find(
                      (location: any) => location._id === lot.locationId,
                    )?.name ?? "Location"}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Select a lot when the stock came from a tracked receipt.
              </span>
            </label>
            <label className="field-label">
              Quantity
              <input
                name="quantity"
                className="input"
                type="number"
                min={0.0001}
                step="any"
                required
              />
            </label>
          </>
        ) : null}
      </div>
    </form>
  );
}
