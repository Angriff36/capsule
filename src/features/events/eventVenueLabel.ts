/**
 * The venue name to print for an event, in truth order: the name snapshot the
 * event itself stored at booking time (a later catalog rename must not
 * retroactively change the booked venue), then the live venue record for
 * legacy events with a venue but no snapshot, then an honest
 * loading/unavailable word. "No venue yet" is reserved for events that really
 * have no venue — never for the moment before the venue list arrives
 * (issue #368: header said "No venue yet" while the venue was attached).
 */
export function eventVenueLabel(input: {
  venueId?: string | null;
  venueName?: string | null;
  venue: { name: string } | null | undefined;
  venuesLoading: boolean;
}): string {
  const snapshot = input.venueName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.venue?.name?.trim();
  if (liveName) return liveName;
  if (input.venueId) {
    return input.venuesLoading ? "Loading venue…" : "Venue record unavailable";
  }
  return "No venue yet";
}
