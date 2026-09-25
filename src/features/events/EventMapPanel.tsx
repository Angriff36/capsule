import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { geocodeDestination } from "../logistics/routePlanner";
import {
  coordinatesMapUrl,
  venueCoordinates,
} from "../facilities/venueCoordinates";
import { EventOverviewCard } from "./EventOverviewCard";

/**
 * Venue map on the overview. Tiles come from OpenStreetMap's keyless embed,
 * pinned by the venue's stored coordinates when it has them; an address-only
 * venue is geocoded once through the same cached Nominatim helper the weather
 * and route planner use. "Open in Google Maps" hands the driver a turn-by-turn
 * link either way — the embed is orientation, not navigation. `children` rides
 * in the card header (the event-day weather chip); `startsAt` feeds it.
 */
export function EventMapPanel({
  venue,
  startsAt,
  children,
}: {
  readonly venue: EventMapVenue | undefined | null;
  readonly startsAt?: number | null;
  readonly children?: ReactNode;
}) {
  const [point, setPoint] = useState<
    { lat: number; lon: number } | null | undefined
  >(undefined);

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

  useEffect(() => {
    if (coords) {
      setPoint({ lat: coords.latitude, lon: coords.longitude });
      return;
    }
    if (!addressQuery) {
      setPoint(null);
      return;
    }
    let active = true;
    setPoint(undefined);
    void geocodeDestination(addressQuery).then((hit) => {
      if (active) setPoint(hit);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.latitude, coords?.longitude, addressQuery]);

  const googleMapsHref = point
    ? coordinatesMapUrl({ latitude: point.lat, longitude: point.lon })
    : addressQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`
      : null;

  const body =
    !venue || (!coords && !addressQuery) ? (
      <p className="text-base text-ink-2">
        No venue location on file yet — add an address or coordinates to the
        venue to see the map.
      </p>
    ) : point === undefined ? (
      <p className="text-base text-ink-2" role="status">
        Locating the venue…
      </p>
    ) : point === null ? (
      <p className="text-base text-ink-2">
        The venue could not be located on the map.{" "}
        {googleMapsHref ? (
          <a className="text-link hover:underline" href={googleMapsHref}>
            Try the address in Google Maps
          </a>
        ) : null}
      </p>
    ) : (
      <iframe
        title={`Map of ${venue?.name ?? "the venue"}`}
        className="event-map-frame"
        loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${point.lon - 0.012}%2C${point.lat - 0.007}%2C${point.lon + 0.012}%2C${point.lat + 0.007}&layer=mapnik&marker=${point.lat}%2C${point.lon}`}
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
