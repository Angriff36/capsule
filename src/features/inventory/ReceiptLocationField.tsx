import { Link } from "react-router-dom";

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
 * it. Existing locations still get the plain select plus a shortcut to add
 * more in the Stock book.
 */
export function ReceiptLocationField({
  locations,
  defaultLocationId,
}: {
  readonly locations: readonly ReceivableLocation[] | undefined;
  readonly defaultLocationId?: string | null;
}) {
  const options = activeLocations(locations);
  if (locations !== undefined && options.length === 0) {
    return (
      <label className="field-label">
        Location
        <input
          name={NEW_LOCATION_FIELD}
          className="input"
          placeholder="e.g. Walk-in cooler"
          autoComplete="off"
          required
          data-testid="receipt-new-location"
        />
        <span className="field-hint">
          No storage locations yet. Name one here and this receipt creates it;
          you can add more later in{" "}
          <Link to="/inventory/stock" className="underline font-medium">
            Inventory → Stock book
          </Link>
          .
        </span>
      </label>
    );
  }
  return (
    <label className="field-label">
      Location
      <select
        name="locationId"
        className="input"
        defaultValue={defaultLocationId ?? ""}
        required
        disabled={locations === undefined}
      >
        <option value="">
          {locations === undefined ? "Loading locations…" : "Select location"}
        </option>
        {options.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
      <span className="field-hint">
        Need another?{" "}
        <Link to="/inventory/stock" className="underline font-medium">
          New location in the Stock book
        </Link>
        .
      </span>
    </label>
  );
}
