import { useState } from "react";
import { ADD_NEW_CHOICE } from "./inlineCatalogChoice";

export type ReceivableLocation = {
  readonly _id: string;
  readonly name: string;
  readonly status?: unknown;
  readonly deletedAt?: number | null;
};

/** Field name the receipt form reads when a new location is typed inline. */
export const NEW_LOCATION_FIELD = "newLocationName";

export function activeLocations(
  locations: readonly ReceivableLocation[] | undefined,
): ReceivableLocation[] {
  return (locations ?? []).filter(
    (item) => item.deletedAt == null && item.status === "active",
  );
}

/**
 * Where a receipt lands. A fresh workspace has no storage locations, and a
 * required select with only its placeholder is a dead end behind a native
 * "select an item" tooltip (#143). With nothing to choose, the field becomes
 * a name box: the receipt creates that location first, then records against
 * it. With locations, "New location…" swaps in the same name box in place,
 * so the typed receipt is never lost to another page (PR04-09).
 */
export function ReceiptLocationField({
  locations,
  defaultLocationId,
}: {
  readonly locations: readonly ReceivableLocation[] | undefined;
  readonly defaultLocationId?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const options = activeLocations(locations);
  if (locations !== undefined && (options.length === 0 || adding)) {
    return (
      <label className="field-label">
        Location
        <input
          name={NEW_LOCATION_FIELD}
          className="input"
          placeholder="e.g. Walk-in cooler"
          autoComplete="off"
          required
          autoFocus={adding}
          data-testid="receipt-new-location"
        />
        <span className="field-hint">
          {options.length === 0
            ? "No storage locations yet. Name one here and this receipt creates it."
            : "Name the new location. This receipt creates it and stays filled in."}
          {options.length > 0 ? (
            <>
              {" "}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => setAdding(false)}
              >
                Pick an existing location
              </button>
            </>
          ) : null}
        </span>
      </label>
    );
  }
  // One location is the obvious place; preselect it rather than make the
  // receiver pick the only choice.
  const initial =
    defaultLocationId ?? (options.length === 1 ? options[0]!._id : "");
  return (
    <label className="field-label">
      Location
      <select
        name="locationId"
        className="input"
        defaultValue={initial}
        required
        disabled={locations === undefined}
        onChange={(event) => {
          if (event.target.value === ADD_NEW_CHOICE) setAdding(true);
        }}
      >
        <option value="">
          {locations === undefined ? "Loading locations…" : "Select location"}
        </option>
        {options.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
        {locations !== undefined ? (
          <option value={ADD_NEW_CHOICE}>New location…</option>
        ) : null}
      </select>
    </label>
  );
}
