import {
  formatCoordinates,
  venueCoordinates,
} from "../facilities/venueCoordinates";

/** The venue fields a picker line needs; any generated Venue row satisfies it. */
export interface VenuePickerFacts {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  capacity?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function venueAddress(
  venue: VenuePickerFacts | undefined,
): string | undefined {
  if (!venue) return undefined;
  return (
    [
      venue.addressLine1,
      venue.addressLine2,
      venue.city,
      venue.region,
      venue.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || undefined
  );
}

/** One quiet line that tells two same-named venues apart in a picker. */
export function venueSummary(venue: VenuePickerFacts): string {
  const pin = venueCoordinates(venue);
  const parts = [
    venueAddress(venue) ??
      (pin ? `GPS ${formatCoordinates(pin)}` : "No address on file"),
  ];
  const capacity = Number(venue.capacity ?? 0);
  parts.push(capacity > 0 ? `capacity ${capacity}` : "capacity not set");
  return parts.join(" · ");
}
