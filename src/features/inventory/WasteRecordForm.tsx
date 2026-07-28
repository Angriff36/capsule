import { useState, type FormEvent } from "react";
import {
  useCreateWasteRecord,
  useListEvent,
  useListIngredient,
  useListInventoryItem,
  useListStorageLocation,
} from "../../lib/manifest-convex-react";
import { SupplyFailureBanner } from "./SupplyFailureBanner";

export const WASTE_REASON_LABELS: Record<string, string> = {
  spoilage: "Spoilage",
  prep_error: "Prep error",
  overproduction: "Over-prep",
  dropped: "Dropped",
  date_expired: "Date expired",
  quality_reject: "Quality reject",
  other: "Other",
};

export function WasteRecordForm({ onClose }: { onClose: () => void }) {
  const items = useListInventoryItem();
  const ingredients = useListIngredient();
  const locations = useListStorageLocation();
  const events = useListEvent();
  const createWasteRecord = useCreateWasteRecord();
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const activeItems = (items ?? []).filter(
    (item) => item.deletedAt == null && item.stockedAt != null,
  );
  const selectedItem = activeItems.find((item) => item._id === inventoryItemId);
  const ingredientName = (id: string) =>
    ingredients?.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const locationName = (id: string) =>
    locations?.find((item) => item._id === id)?.name ?? "Unknown location";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    const eventId = String(data.get("eventId") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim();
    setFailure(null);
    setBusy(true);
    void (async () => {
      try {
        await createWasteRecord({
          ingredientId: selectedItem.ingredientId,
          locationId: selectedItem.locationId,
          inventoryItemId: selectedItem._id,
          quantity: Number(data.get("quantity")),
          unit: selectedItem.unit,
          reason: String(data.get("reason")),
          eventId: eventId || undefined,
          unitCost: selectedItem.unitCost,
          notes: notes || undefined,
        });
        element.reset();
        setInventoryItemId("");
        onClose();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <form className="supply-form" onSubmit={submit} data-testid="waste-form">
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2>Record waste</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : "Record waste"}
          </button>
        </div>
      </div>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      <div className="supply-form-grid">
        <label className="field-label">
          Stock line
          <select
            name="inventoryItemId"
            className="input"
            required
            value={inventoryItemId}
            onChange={(event) => setInventoryItemId(event.currentTarget.value)}
          >
            <option value="">Select stock</option>
            {activeItems.map((item) => (
              <option key={item._id} value={item._id}>
                {ingredientName(item.ingredientId)} ·{" "}
                {locationName(item.locationId)} ({item.quantityOnHand}{" "}
                {item.unit} on hand)
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Quantity{selectedItem ? ` (${selectedItem.unit})` : ""}
          <input
            name="quantity"
            className="input"
            type="number"
            min={0.0001}
            max={selectedItem?.quantityOnHand}
            step="any"
            required
          />
        </label>
        <label className="field-label">
          Reason
          <select name="reason" className="input" required defaultValue="">
            <option value="" disabled>
              Select reason
            </option>
            {Object.entries(WASTE_REASON_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Event
          <select name="eventId" className="input">
            <option value="">No event · kitchen operations</option>
            {(events ?? [])
              .filter((item) => item.deletedAt == null)
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <label className="field-label">
          Notes
          <input name="notes" className="input" />
        </label>
      </div>
    </form>
  );
}
