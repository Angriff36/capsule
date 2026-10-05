import { Link } from "react-router-dom";
import { venueDetailPath } from "../facilities/facilitiesRoutes";
import {
  venueLogisticsLines,
  type VenueLogisticsProfile,
} from "../facilities/venueLogistics";
import { EventOverviewCard } from "./EventOverviewCard";

/** The venue's logistics profile on the event, so the crew reads the dock,
 * elevator, kitchen and access contact before the day. Edited on the venue. */
export function EventVenueLogisticsCard({
  venue,
}: {
  readonly venue:
    (VenueLogisticsProfile & { readonly _id: string }) | null | undefined;
}) {
  if (!venue) return null;
  const lines = venueLogisticsLines(venue);
  return (
    <EventOverviewCard
      title="Venue logistics"
      testId="event-venue-logistics"
      aside={
        <Link
          className="text-base font-medium text-link hover:underline"
          to={venueDetailPath(String(venue._id))}
        >
          Edit on venue
        </Link>
      }
    >
      {lines.length === 0 ? (
        <p className="text-base text-ink-2">
          No logistics on file for this venue yet. Add the dock, elevator,
          kitchen and day-of contact on the venue page.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {lines.map((line) => (
            <div key={line.label}>
              <dt className="text-sm text-ink-3">{line.label}</dt>
              <dd className="whitespace-pre-line text-base text-ink">
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </EventOverviewCard>
  );
}
