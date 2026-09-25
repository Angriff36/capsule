/**
 * The client name to print for an event, in truth order: the name snapshot
 * the event itself stored at booking time (a later catalog edit must not
 * retroactively change the booked client), then the live client record for
 * legacy events with a client but no snapshot, then an honest loading or
 * unavailable word. An event with no client at all prints "—" — the details
 * card always shows a Client row.
 */
export function eventClientLabel(input: {
  clientId?: string | null;
  clientName?: string | null;
  liveName: string;
  clientsLoading: boolean;
}): string {
  const snapshot = input.clientName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.liveName.trim();
  if (liveName && liveName !== "—") return liveName;
  if (input.clientId) {
    return input.clientsLoading ? "Loading client…" : "Client unavailable";
  }
  return "—";
}
