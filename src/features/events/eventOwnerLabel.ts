/**
 * The owner/salesperson name to print for an event, in truth order: the name
 * snapshot the event itself stored at plan / assign time (a later catalog
 * Person.correctIdentity rename must not retroactively change the booked
 * owner), then the live person record for legacy events with an owner but no
 * snapshot, then an honest loading or unavailable word. An event with no
 * assigned owner at all prints "No owner assigned to this event." — the rail
 * always shows an Assigned owner card.
 */
export function eventOwnerLabel(input: {
  assignedToId?: string | null;
  ownerName?: string | null;
  liveName: string;
  peopleLoading: boolean;
}): string {
  const snapshot = input.ownerName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.liveName.trim();
  if (liveName && liveName !== "—") return liveName;
  if (input.assignedToId) {
    return input.peopleLoading ? "Loading owner…" : "Owner unavailable";
  }
  return "No owner assigned to this event.";
}
