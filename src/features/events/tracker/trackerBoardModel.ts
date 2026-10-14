import type { Doc } from "../../../lib/api";
import type { EventMonthRows } from "../../../../convex/eventMonthRows";
import type { Booking } from "./bookingConflicts";
import type { TrackerRow } from "./trackerSheet";

/** An event with no end time is planned as five hours long. */
const DEFAULT_LENGTH = 5 * 60 * 60 * 1000;

export function eventWindow(row: Pick<TrackerRow, "startsAt" | "endsAt">) {
  const start = row.startsAt ?? 0;
  const end =
    row.endsAt != null && row.endsAt > start
      ? row.endsAt
      : start + DEFAULT_LENGTH;
  return { start, end };
}

/** Crew who still work the event. */
const OFF_CREW = new Set(["unassigned", "no_show"]);

export function liveCrew(rows: EventMonthRows["crew"]) {
  return rows.filter(
    (row) => row.deletedAt == null && !OFF_CREW.has(String(row.status)),
  );
}

export function liveHolds(rows: EventMonthRows["equipmentReservations"]) {
  return rows.filter(
    (row) =>
      row.deletedAt == null &&
      row.cancelledAt == null &&
      String(row.status) !== "cancelled" &&
      String(row.status) !== "returned",
  );
}

/**
 * Everything the month's live events have booked: trucks and trailers,
 * drivers and crew, and equipment holds (with their own windows).
 */
export function monthBookings(
  rows: readonly TrackerRow[],
  crew: EventMonthRows["crew"],
  holds: EventMonthRows["equipmentReservations"],
  names: {
    vehicle: (id: string) => string;
    person: (id: string) => string;
    equipment: (id: string) => string;
  },
): Booking[] {
  const out: Booking[] = [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const label = (row: TrackerRow) =>
    row.storedEventNumber
      ? `#${row.storedEventNumber} ${row.title}`
      : row.title;
  for (const row of rows) {
    if (row.startsAt == null || row.stage === "cancelled") continue;
    const { start, end } = eventWindow(row);
    const base = {
      eventId: row.id,
      eventLabel: label(row),
      start,
      end,
      quantity: 1,
    };
    const people = new Set<string>();
    for (const rig of row.rigs) {
      for (const key of [rig.vehicleId, rig.trailerId])
        if (key)
          out.push({
            ...base,
            resource: "vehicle",
            key,
            name: names.vehicle(key),
          });
      if (rig.driverId) people.add(rig.driverId);
    }
    for (const person of crew)
      if (person.eventId === row.id) people.add(String(person.personId));
    for (const key of people)
      out.push({ ...base, resource: "person", key, name: names.person(key) });
  }
  for (const hold of holds) {
    const row = byId.get(String(hold.eventId));
    if (!row || row.stage === "cancelled") continue;
    const fallback = eventWindow(row);
    out.push({
      resource: "equipment",
      key: String(hold.equipmentId),
      name: names.equipment(String(hold.equipmentId)),
      eventId: row.id,
      eventLabel: label(row),
      start: hold.startsAt ?? fallback.start,
      end: hold.endsAt ?? fallback.end,
      quantity: hold.quantity,
    });
  }
  return out;
}

/** The most units of one item held at one moment by these bookings. */
export function peakHeld(bookings: readonly Booking[], key: string): number {
  const rows = bookings.filter(
    (row) => row.resource === "equipment" && row.key === key,
  );
  let peak = 0;
  for (const row of rows) {
    const at = rows
      .filter((other) => other.start < row.end && row.start < other.end)
      .reduce((sum, other) => sum + other.quantity, 0);
    peak = Math.max(peak, at);
  }
  return peak;
}

export function vehicleLabel(row: Doc<"vehicles"> | Doc<"trailers">) {
  const name = `${row.make} ${row.model}`.trim();
  return row.registration ? `${name} · ${row.registration}` : name;
}

/**
 * Which tracker column a catalog item belongs in, by its kind (owner,
 * 2026-10-14: "equipment should be stuff like tents, generators, grills,
 * ovens, fryers, propane tanks, 2 burner stoves"). Decor kinds go in the
 * Décor column; hand tools and food items stay on the pack list only. Any
 * other kind, including one the office adds, is equipment.
 */
const DECOR_KINDS = new Set([
  "decor",
  "florals",
  "lighting decor",
  "custom signage",
  "linen",
  "home goods",
  "staging",
  "pipe & drape",
  "entertainment & games",
]);
const PACK_ONLY_KINDS = new Set(["cooking", "food & beverage"]);

export type TrackerKind = "equipment" | "decor" | "pack";

export function trackerKind(category: string): TrackerKind {
  const kind = category.trim().toLowerCase();
  if (DECOR_KINDS.has(kind)) return "decor";
  if (PACK_ONLY_KINDS.has(kind)) return "pack";
  return "equipment";
}

export const TRACKER_KIND_LABEL: Record<TrackerKind, string> = {
  equipment: "Equipment",
  decor: "Décor",
  pack: "Small wares (pack list only)",
};
