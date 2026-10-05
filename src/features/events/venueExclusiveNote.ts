/**
 * The picker note for a venue-exclusive dish (Venue Partner Playbook section
 * 07). Never blocks: a planner may still add it, the note just says so.
 */
export function venueExclusiveNote(
  dishVenueId: string | null | undefined,
  eventVenueId: string | null | undefined,
  venueNames: ReadonlyMap<string, string>,
): string | null {
  if (!dishVenueId) return null;
  if (eventVenueId && String(eventVenueId) === String(dishVenueId))
    return "Made for this venue";
  return `Only at ${venueNames.get(String(dishVenueId)) ?? "another venue"}`;
}
