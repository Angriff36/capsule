import { useState, type FormEvent } from "react";
import {
  useCreateInventoryItem,
  useCreateInventoryReservation,
  useCreateStorageLocation,
  useInventoryItemReceiveStock,
  useInventoryItemRecount,
  useInventoryReservationConsume,
  useInventoryReservationRelease,
  useListEvent,
  useListIngredient,
  useListInventoryItem,
  useListInventoryReservation,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
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

export function StockBookPage() {
  const items = useListInventoryItem();
  const reservations = useListInventoryReservation();
  const locations = useListStorageLocation();
  const ingredients = useListIngredient();
  const events = useListEvent();
  const createLocation = useCreateStorageLocation();
  const createItem = useCreateInventoryItem();
  const createReservation = useCreateInventoryReservation();
  const receiveStock = useInventoryItemReceiveStock();
  const recount = useInventoryItemRecount();
  const consumeReservation = useInventoryReservationConsume();
  const releaseReservation = useInventoryReservationRelease();
  const [form, setForm] = useState<"location" | "stock" | "reserve" | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activeItems = (items ?? []).filter((item) => item.deletedAt == null);
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
        await createReservation({
          inventoryItemId: item._id,
          eventId: String(data.get("eventId")),
          ingredientId: item.ingredientId,
          quantity: Number(data.get("quantity")),
        });
      }
      element.reset();
      setForm(null);
    });
  };

  const stockAction = (item: any, action: "receive" | "recount") => {
    const label =
      action === "receive" ? "Quantity received" : "Actual quantity";
    const quantity = Number(window.prompt(label));
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
  };

  const reservationAction = (reservation: any, key: string) => {
    void run(`${reservation._id}:${key}`, async () => {
      const args = { docId: reservation._id, version: reservation.version };
      if (key === "consume") await consumeReservation(args);
      if (key === "release") {
        const reason = window.prompt("Release reason")?.trim();
        if (!reason) return;
        await releaseReservation({ ...args, reason });
      }
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
        <strong>Visible facts, not inferred shortage</strong>
        <span>
          Quantities use the current number projection. Search and exact decimal
          precision remain degraded; on-hand and active reservation totals are
          shown separately rather than inventing an aggregate shortage rule.
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {form ? (
        <SupplyStockForm
          kind={form}
          items={activeItems}
          ingredients={ingredients ?? []}
          locations={locations ?? []}
          events={events ?? []}
          busy={busy != null}
          onSubmit={submit}
          onClose={() => setForm(null)}
        />
      ) : null}

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
            <span>Reservations retain event and stock-line provenance.</span>
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
    </div>
  );
}

function SupplyStockForm({
  kind,
  items,
  ingredients,
  locations,
  events,
  busy,
  onSubmit,
  onClose,
}: any) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Governed inventory command</p>
          <h2>
            {kind === "location"
              ? "Register storage"
              : kind === "stock"
                ? "Open stock line"
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
