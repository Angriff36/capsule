/**
 * Double-booking warnings for the event tracker (owner, 2026-10-14: warn when
 * a vehicle, a person or a piece of equipment is already in use by another
 * event, with rules the office sets, "so that you can book on the same day
 * but different times"). A warning never blocks; the office can book anyway.
 */

export type BookingResource = "vehicle" | "person" | "equipment";
export type BookingWarnMode = "same_day" | "overlap" | "off";

export interface BookingRuleValue {
  mode: BookingWarnMode;
  gapMinutes: number;
}

export type BookingRules = Record<BookingResource, BookingRuleValue>;

/** With no saved rule: warn when the same thing is booked the same day. */
export const DEFAULT_RULES: BookingRules = {
  vehicle: { mode: "same_day", gapMinutes: 0 },
  person: { mode: "same_day", gapMinutes: 0 },
  equipment: { mode: "same_day", gapMinutes: 0 },
};

export const RESOURCE_LABEL: Record<BookingResource, string> = {
  vehicle: "Vehicles and trailers",
  person: "People",
  equipment: "Equipment",
};

export const MODE_LABEL: Record<BookingWarnMode, string> = {
  same_day: "Warn when booked the same day",
  overlap: "Warn only when the times overlap",
  off: "Do not warn",
};

/** One thing booked on one event for a span of time. */
export interface Booking {
  resource: BookingResource;
  /** The vehicle, person or equipment id. */
  key: string;
  name: string;
  eventId: string;
  eventLabel: string;
  start: number;
  end: number;
  /** Equipment only: how many units. */
  quantity: number;
}

export interface BookingConflict {
  resource: BookingResource;
  key: string;
  name: string;
  eventIds: string[];
  text: string;
}

function dayOf(time: number): number {
  const date = new Date(time);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** Do two bookings of the same thing clash under this rule? */
export function clashes(
  a: Pick<Booking, "start" | "end">,
  b: Pick<Booking, "start" | "end">,
  rule: BookingRuleValue,
): boolean {
  if (rule.mode === "off") return false;
  if (rule.mode === "same_day") {
    // Any calendar day both bookings touch.
    const aFirst = dayOf(a.start);
    const aLast = dayOf(Math.max(a.start, a.end - 1));
    const bFirst = dayOf(b.start);
    const bLast = dayOf(Math.max(b.start, b.end - 1));
    return aFirst <= bLast && bFirst <= aLast;
  }
  const gap = Math.max(0, rule.gapMinutes) * 60_000;
  return a.start < b.end + gap && b.start < a.end + gap;
}

function timeText(booking: Booking): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const day = new Date(booking.start).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${day} ${new Date(booking.start).toLocaleTimeString(undefined, opts)}–${new Date(booking.end).toLocaleTimeString(undefined, opts)}`;
}

/**
 * Warnings for one new booking against what is already booked. Equipment
 * warns only when the clashing holds and this one add up to more than the
 * stock; vehicles and people warn on any clash.
 */
export function warningsFor(
  candidate: Booking,
  booked: readonly Booking[],
  rules: BookingRules,
  stock: (key: string) => number,
): string[] {
  const rule = rules[candidate.resource];
  const others = booked.filter(
    (row) =>
      row.resource === candidate.resource &&
      row.key === candidate.key &&
      row.eventId !== candidate.eventId &&
      clashes(candidate, row, rule),
  );
  if (others.length === 0) return [];
  if (candidate.resource === "equipment") {
    const have = stock(candidate.key);
    const held = others.reduce((sum, row) => sum + row.quantity, 0);
    if (held + candidate.quantity <= have) return [];
    return [
      `${candidate.name}: ${have} in stock, ${held} already held by ${others
        .map((row) => `${row.eventLabel} (${row.quantity}, ${timeText(row)})`)
        .join(", ")}, and you want ${candidate.quantity} more.`,
    ];
  }
  return others.map(
    (row) =>
      `${candidate.name} is already on ${row.eventLabel} (${timeText(row)}).`,
  );
}

/** Every clash among these bookings, one line per thing. */
export function findConflicts(
  bookings: readonly Booking[],
  rules: BookingRules,
  stock: (key: string) => number,
): BookingConflict[] {
  const byThing = new Map<string, Booking[]>();
  for (const row of bookings) {
    const id = `${row.resource}:${row.key}`;
    byThing.set(id, [...(byThing.get(id) ?? []), row]);
  }
  const out: BookingConflict[] = [];
  for (const rows of byThing.values()) {
    const first = rows[0]!;
    const rule = rules[first.resource];
    const sorted = [...rows].sort((a, b) => a.start - b.start);
    const hit = new Set<Booking>();
    for (let i = 0; i < sorted.length; i += 1) {
      const group = sorted.filter(
        (row) =>
          row.eventId !== sorted[i]!.eventId && clashes(sorted[i]!, row, rule),
      );
      if (group.length === 0) continue;
      if (first.resource === "equipment") {
        const total =
          sorted[i]!.quantity +
          group.reduce((sum, row) => sum + row.quantity, 0);
        if (total <= stock(first.key)) continue;
      }
      hit.add(sorted[i]!);
      for (const row of group) hit.add(row);
    }
    if (hit.size === 0) continue;
    const list = [...hit].sort((a, b) => a.start - b.start);
    const events = [...new Set(list.map((row) => row.eventId))];
    out.push({
      resource: first.resource,
      key: first.key,
      name: first.name,
      eventIds: events,
      text:
        first.resource === "equipment"
          ? `${first.name}: ${list.reduce((sum, row) => sum + row.quantity, 0)} booked, ${stock(first.key)} in stock: ${list.map((row) => `${row.eventLabel} (${row.quantity}, ${timeText(row)})`).join(" & ")}`
          : `${first.name}: ${list.map((row) => `${row.eventLabel} (${timeText(row)})`).join(" & ")}`,
    });
  }
  return out;
}
