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
  trackingMode?: "serialized" | "bulk" | null;
  serialNumber?: string | null;
  description?: string | null;
  countUnit?: string | null;
  replacementCost?: number | null;
  customerPrice?: number | null;
  vendorId?: string | null;
};

export type VendorChoice = { vendorId: string; name: string };

function text(data: FormData, name: string): string | undefined {
  const value = String(data.get(name) ?? "").trim();
  return value.length > 0 ? value : undefined;
}

function money(data: FormData, name: string): number | undefined {
  const value = text(data, name);
  return value === undefined ? undefined : Number(value);
}

/** The catalog facts both register and edit send (blank = leave unset). */
export function equipmentCatalogFields(data: FormData) {
  return {
    trackingMode: String(data.get("trackingMode") ?? "bulk") as
      "serialized" | "bulk",
    serialNumber: text(data, "serialNumber"),
    description: text(data, "description"),
    countUnit: text(data, "countUnit"),
    replacementCost: money(data, "replacementCost"),
    customerPrice: money(data, "customerPrice"),
    vendorId: text(data, "vendorId"),
    homeLocation: text(data, "homeLocation"),
  };
}

/** Register-one / edit-one form for the equipment catalog. */
export function EquipmentForm({
  busy,
  onSubmit,
  onClose,
  editItem,
  vendors,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  editItem?: EquipmentDetailRow | null;
  vendors: VendorChoice[];
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
            <input
              name="assetTag"
              className="input"
              placeholder="Leave blank to tag from the name"
            />
            <span className="field-hint">
              Optional — blank gets a tag like BIG-JOHN-GRILL.
            </span>
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
        <label className="field-label">
          How it is counted
          <select
            name="trackingMode"
            className="input"
            defaultValue={editItem?.trackingMode ?? "bulk"}
          >
            <option value="bulk">A group we count (chairs, linens)</option>
            <option value="serialized">One piece with a serial number</option>
          </select>
        </label>
        <label className="field-label">
          Serial number
          <input
            name="serialNumber"
            className="input"
            defaultValue={editItem?.serialNumber ?? ""}
            placeholder="Only for one-piece items"
          />
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
          Counted as
          <input
            name="countUnit"
            className="input"
            defaultValue={editItem?.countUnit ?? ""}
            placeholder="each, set of 10, case of 25"
          />
        </label>
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
        <label className="field-label">
          Replacement cost (per unit)
          <input
            name="replacementCost"
            className="input"
            type="number"
            min={0}
            step="any"
            defaultValue={editItem?.replacementCost ?? ""}
            placeholder="What a lost one costs us"
          />
        </label>
        <label className="field-label">
          Client price (per unit)
          <input
            name="customerPrice"
            className="input"
            type="number"
            min={0}
            step="any"
            defaultValue={editItem?.customerPrice ?? ""}
            placeholder="What a client pays to rent one"
          />
        </label>
        <label className="field-label">
          Rented from
          <select
            name="vendorId"
            className="input"
            defaultValue={editItem?.vendorId ?? ""}
          >
            <option value="">No vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.vendorId} value={vendor.vendorId}>
                {vendor.name}
              </option>
            ))}
          </select>
          <span className="field-hint">For items we rent, not own.</span>
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
        <label className="field-label">
          Storage place
          <input
            name="homeLocation"
            className="input"
            defaultValue={editItem?.homeLocation ?? ""}
            placeholder="Where it lives"
          />
        </label>
        {editing ? (
          <label className="field-label">
            Current location
            <input
              name="currentLocation"
              className="input"
              defaultValue={editItem?.currentLocation ?? ""}
              placeholder="Where it is now"
            />
          </label>
        ) : null}
        <label className="field-label">
          Description
          <input
            name="description"
            className="input"
            defaultValue={editItem?.description ?? ""}
            placeholder="Size, colour, what it looks like"
          />
        </label>
      </div>
    </form>
  );
}
