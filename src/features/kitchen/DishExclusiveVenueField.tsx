import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useDishSetExclusiveVenue,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { venueDetailPath } from "../facilities/facilitiesRoutes";

/**
 * Venue-exclusive menu item (Venue Partner Playbook section 07): a dish can be
 * offered only at one venue. "Any venue" offers it everywhere.
 */
export function DishExclusiveVenueField({
  dish,
  onFailure,
}: {
  dish: { _id: string; version: number; exclusiveVenueId?: string | null };
  onFailure: (error: unknown) => void;
}) {
  const venues = useListVenue();
  const setExclusiveVenue = useDishSetExclusiveVenue();
  const [busy, setBusy] = useState(false);
  const current = String(dish.exclusiveVenueId ?? "");
  const options = (venues ?? []).filter(
    (venue) => venue.deletedAt == null || String(venue._id) === current,
  );
  const chosen = options.find((venue) => String(venue._id) === current);

  return (
    <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
      Offered at
      <select
        className="input w-auto"
        value={current}
        disabled={busy || venues === undefined}
        onChange={(event) => {
          const venueId = event.target.value;
          setBusy(true);
          void setExclusiveVenue({
            docId: dish._id,
            version: dish.version,
            venueId: venueId || undefined,
          })
            .catch(onFailure)
            .finally(() => setBusy(false));
        }}
      >
        <option value="">Any venue</option>
        {options.map((venue) => (
          <option key={venue._id} value={venue._id}>
            Only at {venue.name}
          </option>
        ))}
      </select>
      {chosen ? (
        <Link className="link" to={venueDetailPath(String(chosen._id))}>
          Open venue
        </Link>
      ) : null}
    </label>
  );
}
