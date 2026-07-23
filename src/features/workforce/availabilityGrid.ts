/**
 * Pure derivation of per-day availability from RecurringAvailability rows
 * (general weekly pattern) and AvailabilityWindow rows (date-range
 * exceptions). Client-side read model — command writes stay governed.
 */

export interface RecurringRow {
  personId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  status: string;
  deletedAt?: number | null;
}

export interface WindowRow {
  personId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  kind?: string;
  status: string;
  deletedAt?: number | null;
}

export interface DayCell {
  state: "off" | "available" | "unknown";
  label: string;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const minuteLabel = (minute: number) =>
  new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60).toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" },
  );

export const bandLabel = (startMinute: number, endMinute: number) =>
  `${minuteLabel(startMinute)}–${minuteLabel(endMinute)}`;

/** "HH:MM" from a <input type="time"> → minutes from midnight, or NaN. */
export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours! * 60 + minutes!
    : Number.NaN;
};

const isLive = (row: { status: string; deletedAt?: number | null }) =>
  row.deletedAt == null && row.status === "active";

/** Resolve one person's availability for the day starting at `dayStart` (local midnight). */
export function availabilityForDay(
  dayStart: Date,
  recurring: RecurringRow[],
  windows: WindowRow[],
): DayCell {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const overlapping = windows.filter(
    (row) =>
      isLive(row) &&
      row.startsAt != null &&
      row.endsAt != null &&
      row.startsAt < dayEndMs &&
      row.endsAt > dayStartMs,
  );
  if (overlapping.some((row) => row.kind === "unavailable")) {
    return { state: "off", label: "Time off" };
  }

  const bands = recurring
    .filter((row) => isLive(row) && row.dayOfWeek === dayStart.getDay())
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((row) => bandLabel(row.startMinute, row.endMinute));

  for (const row of overlapping) {
    const from = Math.max(row.startsAt!, dayStartMs);
    const to = Math.min(row.endsAt!, dayEndMs);
    bands.push(
      bandLabel(
        Math.round((from - dayStartMs) / 60000),
        Math.round((to - dayStartMs) / 60000),
      ),
    );
  }

  return bands.length
    ? { state: "available", label: bands.join(", ") }
    : { state: "unknown", label: "—" };
}

/** The next `count` local-midnight day starts, beginning today. */
export function upcomingDays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + index);
    return day;
  });
}
