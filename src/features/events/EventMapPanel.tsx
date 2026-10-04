import type { ReactNode } from "react";
import {
  coordinatesMapUrl,
  venueCoordinates,
} from "../facilities/venueCoordinates";
import { EventOverviewCard } from "./EventOverviewCard";

/**
 * Venue map on the overview: Google Maps' keyless embed, pinned by the
 * venue's stored coordinates or else its address. "Open in Google Maps" hands
 * the driver a turn-by-turn link — the embed is orientation, not navigation. `children` rides
 * in the card header (the event-day weather chip); `startsAt` feeds it.
 */
export function EventMapPanel({
  venue,
  children,
}: {
  readonly venue: EventMapVenue | undefined | null;
  readonly startsAt?: number | null;
  readonly children?: ReactNode;
}) {
  const coords = venue ? venueCoordinates(venue) : null;
  const addressQuery = venue
    ? [
        venue.addressLine1,
        venue.city,
        venue.region,
        venue.postalCode,
        venue.countryCode,
      ]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(", ")
    : "";

  // Google finds the address itself (Ryan 2026-10-04: the free OpenStreetMap
  // search missed "2440 BUILDING 2440 NE Hopkins Ct."), and its plain embed
  // needs no key. Stored coordinates win over the address.
  const mapQuery = coords
    ? `${coords.latitude},${coords.longitude}`
    : addressQuery;
  const googleMapsHref = coords
    ? coordinatesMapUrl(coords)
    : addressQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`
      : null;

  const body = !mapQuery ? (
    <p className="text-base text-ink-2">
      No venue location on file yet — add an address or coordinates to the venue
      to see the map.
    </p>
  ) : (
    <iframe
      title={`Map of ${venue?.name ?? "the venue"}`}
      className="event-map-frame"
      loading="lazy"
      src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}
    />
  );

  return (
    <EventOverviewCard
      title="Venue map"
      testId="event-map-panel"
      aside={
        <>
          {children}
          {googleMapsHref ? (
            <a
              className="text-base font-medium text-link hover:underline"
              href={googleMapsHref}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Maps
            </a>
          ) : null}
        </>
      }
    >
      {body}
      {venue?.name || addressQuery ? (
        <p className="mt-2 text-sm text-ink-3">
          {[venue?.name, addressQuery].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </EventOverviewCard>
  );
}

type EventMapVenue = {
  name?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
