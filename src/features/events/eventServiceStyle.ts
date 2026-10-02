/**
 * One way to read an event's service style for lists, filters and reports.
 * The event list read joins the style record as `serviceStyle`; the id and the
 * booked name sit on the event itself. Group by the id, never the joined
 * record: every read hands back a new copy of it.
 */
export type EventServiceStyleSource = {
  serviceStyleId?: string | null;
  serviceStyleName?: string | null;
  serviceStyle?: { name?: string | null } | null;
};

export const NO_SERVICE_STYLE = "none";

export function eventServiceStyleKey(event: EventServiceStyleSource): string {
  return event.serviceStyleId ? String(event.serviceStyleId) : NO_SERVICE_STYLE;
}

export function eventServiceStyleLabel(event: EventServiceStyleSource): string {
  if (!event.serviceStyleId) return "No service style";
  return (
    event.serviceStyle?.name?.trim() ||
    event.serviceStyleName?.trim() ||
    "Service style no longer listed"
  );
}

/** The styles the events actually use, for a filter list, by name. */
export function eventServiceStyleChoices(
  events: readonly EventServiceStyleSource[],
): { key: string; label: string; count: number }[] {
  const byKey = new Map<
    string,
    { key: string; label: string; count: number }
  >();
  for (const event of events) {
    const key = eventServiceStyleKey(event);
    const found = byKey.get(key);
    if (found) found.count += 1;
    else
      byKey.set(key, { key, label: eventServiceStyleLabel(event), count: 1 });
  }
  return [...byKey.values()].sort((a, b) =>
    a.key === NO_SERVICE_STYLE
      ? 1
      : b.key === NO_SERVICE_STYLE
        ? -1
        : a.label.localeCompare(b.label),
  );
}
