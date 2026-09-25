/**
 * The occasion name to print for an event, in truth order: the name
 * snapshot the event itself stored at booking time (a later catalog rename
 * must not retroactively change the booked occasion), then the live occasion
 * record for legacy events with an occasion but no snapshot, then an honest
 * loading/unavailable word. An event with no occasion at all prints nothing —
 * the details card hides the row rather than showing "No occasion yet".
 */
export function eventOccasionLabel(input: {
  occasionId?: string | null;
  occasionName?: string | null;
  occasion: { name: string } | null | undefined;
  occasionsLoading: boolean;
}): string | null {
  const snapshot = input.occasionName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.occasion?.name?.trim();
  if (liveName) return liveName;
  if (input.occasionId) {
    return input.occasionsLoading
      ? "Loading occasion…"
      : "Occasion unavailable";
  }
  return null;
}
