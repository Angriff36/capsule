/**
 * The service style name to print for an event, in truth order: the name
 * snapshot the event itself stored at booking time (a later catalog rename
 * must not retroactively change the booked style), then the live style record
 * for legacy events with a style but no snapshot, then an honest
 * loading/unavailable word. An event with no style at all prints nothing —
 * the details card hides the row rather than showing "No service style yet".
 */
export function eventServiceStyleLabel(input: {
  serviceStyleId?: string | null;
  serviceStyleName?: string | null;
  serviceStyle: { name: string } | null | undefined;
  serviceStylesLoading: boolean;
}): string | null {
  const snapshot = input.serviceStyleName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.serviceStyle?.name?.trim();
  if (liveName) return liveName;
  if (input.serviceStyleId) {
    return input.serviceStylesLoading
      ? "Loading service style…"
      : "Service style unavailable";
  }
  return null;
}
