import type { FormEvent } from "react";

export const EQUIPMENT_CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
  "out_of_service",
] as const;

export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number];

export const EQUIPMENT_CATEGORY_SUGGESTIONS = [
  "Cooking",
  "Serving",
  "Holding",
  "Furniture",
  "Linens",
  "Shelter",
  "Sanitation",
  "Safety",
  "Site",
  "Transport",
  "Front of House",
  "Rentals",
];

export type EquipmentDetailRow = {
  _id: string;
  version: number;
  name: string;
  category: string;
  ownership: "owned" | "rented";
  purchaseValue: number;
  homeLocation?: string | null;
  currentLocation?: string | null;
};

/** Register-one / edit-one form for the equipment catalog. */
export function EquipmentForm({
  busy,
  onSubmit,
  onClose,
  editItem,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  editItem?: EquipmentDetailRow | null;
}) {
  const editing = editItem != null;
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Equipment</p>
          <h2>{editing ? "Edit equipment details" : "Register equipment"}</h2>
        </div>
        <div className="supply-row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Working…" : editing ? "Save" : "Register"}
          </button>
        </div>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Name
          <input
            name="name"
            className="input"
            required
            autoFocus
            defaultValue={editItem?.name}
          />
        </label>
        {editing ? null : (
          <label className="field-label">
            Asset tag
            <input name="assetTag" className="input" required />
          </label>
        )}
        <label className="field-label">
          Category
          <input
            name="category"
            className="input"
            required
            list="equipment-categories"
            defaultValue={editItem?.category}
          />
          <datalist id="equipment-categories">
            {EQUIPMENT_CATEGORY_SUGGESTIONS.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        <label className="field-label">
          Ownership
          <select
            name="ownership"
            className="input"
            defaultValue={editItem?.ownership ?? "owned"}
          >
            <option value="owned">Owned</option>
            <option value="rented">Rented</option>
          </select>
        </label>
        {editing ? null : (
          <label className="field-label">
            Quantity
            <input
              name="quantity"
              className="input"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
              required
            />
          </label>
        )}
        <label className="field-label">
          Purchase value (per unit)
          <input
            name="purchaseValue"
            className="input"
            type="number"
            min={0}
            step="any"
            defaultValue={editItem?.purchaseValue ?? 0}
            required
          />
        </label>
        {editing ? null : (
          <label className="field-label">
            Condition
            <select name="condition" className="input" defaultValue="good">
              {EQUIPMENT_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        )}
        {editing ? (
          <>
            <label className="field-label">
              Home location
              <input
                name="homeLocation"
                className="input"
                defaultValue={editItem?.homeLocation ?? ""}
                placeholder="Where it lives"
              />
            </label>
            <label className="field-label">
              Current location
              <input
                name="currentLocation"
                className="input"
                defaultValue={editItem?.currentLocation ?? ""}
                placeholder="Where it is now"
              />
            </label>
          </>
        ) : null}
      </div>
    </form>
  );
}
