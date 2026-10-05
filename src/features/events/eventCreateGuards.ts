/** Why the create-event submit control is inert — never a silent disabled button. */
export function eventCreateDisabledReason(input: {
  busy: boolean;
  clientId: string;
}): string | null {
  if (input.busy) return null;
  if (!input.clientId.trim()) return "Pick a client for this event.";
  return null;
}
