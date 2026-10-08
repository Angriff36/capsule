import { useState } from "react";
import { SearchSelect } from "../../ui/SearchSelect";
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
const ANY_VENUE = "any-venue";

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
      <SearchSelect
        value={current || ANY_VENUE}
        disabled={busy || venues === undefined}
        aria-label="Offered at"
        placeholder="Search venues…"
        recentsKey="venues"
        options={[
          { id: ANY_VENUE, label: "Any venue" },
          ...options.map((venue) => ({
            id: String(venue._id),
            label: `Only at ${venue.name}`,
          })),
        ]}
        onChange={(picked) => {
          const venueId = picked === ANY_VENUE ? "" : picked;
          if (venueId === current) return;
          setBusy(true);
          void setExclusiveVenue({
            docId: dish._id,
            version: dish.version,
            venueId: venueId || undefined,
          })
            .catch(onFailure)
            .finally(() => setBusy(false));
        }}
      />
      {chosen ? (
        <Link className="link" to={venueDetailPath(String(chosen._id))}>
          Open venue
        </Link>
      ) : null}
    </label>
  );
}
