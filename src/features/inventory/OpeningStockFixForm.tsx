// Fix one opening stock row: what it is, which item, where, how much, in what
// unit, when it was counted and whether it was counted by hand. The server
// works out the open issues again from these answers.
import { useState, type FormEvent } from "react";
import {
  OPENING_STOCK_KIND_TEXT,
  type OpeningStockCountState,
  type OpeningStockKind,
} from "../../lib/openingStock";
import { unitOptionsFor } from "../kitchen/import/UnitOfMeasureMapper";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

type Named = { _id: string; name: string };

export type OpeningStockFixValues = {
  kind: OpeningStockKind;
  ingredientId: string | null;
  componentId: string | null;
  locationId: string | null;
  quantity: number | null;
  unit: string | null;
  asOfAt: number | null;
  countState: OpeningStockCountState;
  note: string | null;
};

export type OpeningStockFixRecord = {
  kind: string;
  ingredientId?: string | null;
  componentId?: string | null;
  locationId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  sourceUnit: string;
  asOfAt?: number | null;
  countState: string;
  note?: string | null;
};

const COUNT_STATE_TEXT: Record<OpeningStockCountState, string> = {
  counted: "Counted by hand",
  unverified: "Not checked",
  estimated: "Estimate",
  unknown: "Not known",
};

const dateInput = (at: number | null | undefined) =>
  at == null ? "" : new Date(at).toISOString().slice(0, 10);

export function OpeningStockFixForm({
  record,
  ingredients,
  components,
  locations,
  busy,
  onSave,
  onCancel,
}: {
  record: OpeningStockFixRecord;
  ingredients: Named[];
  components: Named[];
  locations: Named[];
  busy: boolean;
  onSave: (values: OpeningStockFixValues) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(record.kind as OpeningStockKind);
  const [itemId, setItemId] = useState(
    String(record.ingredientId ?? record.componentId ?? ""),
  );
  const [locationId, setLocationId] = useState(String(record.locationId ?? ""));
  const [quantity, setQuantity] = useState(
    record.quantity == null ? "" : String(record.quantity),
  );
  const [unit, setUnit] = useState(String(record.unit ?? ""));
  const [asOf, setAsOf] = useState(dateInput(record.asOfAt));
  const [asOfError, setAsOfError] = useState("");
  const [countState, setCountState] = useState(
    record.countState as OpeningStockCountState,
  );
  const [note, setNote] = useState(String(record.note ?? ""));

  const items =
    kind === "ingredient"
      ? ingredients
      : kind === "component"
        ? components
        : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A count can't happen in the future (YYYY-MM-DD compares as text).
    if (asOf && asOf > dateInput(Date.now())) {
      setAsOfError("A count date can't be in the future.");
      return;
    }
    setAsOfError("");
    const amount = quantity.trim() === "" ? null : Number(quantity);
    onSave({
      kind,
      ingredientId: kind === "ingredient" && itemId ? itemId : null,
      componentId: kind === "component" && itemId ? itemId : null,
      locationId: locationId || null,
      quantity: amount != null && Number.isFinite(amount) ? amount : null,
      unit: unit || null,
      asOfAt: asOf ? Date.parse(`${asOf}T12:00:00Z`) : null,
      countState,
      note: note.trim() || null,
    });
  };

  return (
    <form className="grid gap-3 p-3 sm:grid-cols-4" onSubmit={submit}>
      <label className="field-label">
        What it is
        <select
          className="input"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as OpeningStockKind);
            setItemId("");
          }}
        >
          {(Object.keys(OPENING_STOCK_KIND_TEXT) as OpeningStockKind[]).map(
            (value) => (
              <option key={value} value={value}>
                {OPENING_STOCK_KIND_TEXT[value]}
              </option>
            ),
          )}
        </select>
      </label>
      {kind === "ingredient" || kind === "component" ? (
        <label className="field-label">
          Item in the catalog
          <select
            className="input"
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
          >
            <option value="">Pick an item</option>
            {items.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field-label">
        Kept in
        <select
          className="input"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          <option value="">Pick a storage place</option>
          {locations.map((location) => (
            <option key={location._id} value={location._id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Amount
        <input
          className="input"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="Blank if not counted"
        />
      </label>
      <label className="field-label">
        Unit{record.sourceUnit ? ` (sheet says "${record.sourceUnit}")` : ""}
        <select
          className="input"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
        >
          <option value="">Pick a unit</option>
          {unitOptionsFor(unit).map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Counted on
        <BoundedDateInput
          naturalDateDirection="any"
          className="input"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
        />
        {asOfError ? (
          <span role="alert" className="text-sm text-danger">
            {asOfError}
          </span>
        ) : null}
      </label>
      <label className="field-label">
        How sure
        <select
          className="input"
          value={countState}
          onChange={(event) =>
            setCountState(event.target.value as OpeningStockCountState)
          }
        >
          {(Object.keys(COUNT_STATE_TEXT) as OpeningStockCountState[]).map(
            (value) => (
              <option key={value} value={value}>
                {COUNT_STATE_TEXT[value]}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="field-label">
        Note
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-4">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          {busy ? "Saving…" : "Save row"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export { COUNT_STATE_TEXT };
