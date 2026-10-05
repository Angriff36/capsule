// Venue link for a website inquiry (PL-NATIVE-JOURNEY AC-184). The visitor
// types a venue name; when exactly one saved, active venue has that name
// (trim + case-insensitive, the booking rule in proposalBookingVenue.ts) AND
// that venue can be driven to (a map pin, or a street and city), the new
// event points at it, so venue figures count website events. A saved venue
// with no address is not linked: the drive-time planner reads a linked
// venue's own address, and it would drop the address the visitor typed. Two
// venues with the same name are not linked (never a silent first match).
import { proposalBookingVenue } from "./proposalBookingVenue";

export type InquiryVenueRow = {
  _id: string;
  name: string;
  status: string;
  deletedAt?: number | null;
  addressLine1?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function inquiryVenueMatch<T extends InquiryVenueRow>(
  typedName: string | null | undefined,
  venues: readonly T[],
): T | null {
  const wanted = proposalBookingVenue.normalizeName(typedName);
  if (!wanted) return null;
  const matches = venues.filter(
    (venue) =>
      venue.deletedAt == null &&
      venue.status === "active" &&
      proposalBookingVenue.normalizeName(venue.name) === wanted,
  );
  if (matches.length !== 1) return null;
  const venue = matches[0];
  const hasPin =
    typeof venue.latitude === "number" && typeof venue.longitude === "number";
  const hasStreet = filled(venue.addressLine1) && filled(venue.city);
  return hasPin || hasStreet ? venue : null;
}
