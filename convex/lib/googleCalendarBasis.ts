// PL-CONNECTIONS (AC-114): what the Google Calendar connection was agreed to
// do, recorded WITH the connect, before the first sync can run. Capsule owns
// every field it writes and only ever writes one way (Capsule -> Google), so a
// change made in Google to a Capsule entry is replaced by Capsule's next update
// and nothing Google says is read back: there is no edit loop to break.

/** The calendar entry fields Capsule owns, in plain words. */
export const CALENDAR_FIELDS_OWNED_BY_CAPSULE = [
  "event name",
  "date and time",
  "venue",
  "expected headcount",
] as const;

const DAY_MS = 24 * 60 * 60_000;

export interface CalendarSyncBasis {
  direction: "capsule_to_google";
  fieldsOwnedByCapsule: string[];
  /** Events that end before this time are left off unless includePast. */
  startsFrom: number;
  includePast: boolean;
  recordedAt: number;
}

/** The basis for a new connection: from the start of the connect day (UTC). */
export function newCalendarBasis(
  connectedAt: number,
  includePast: boolean,
): CalendarSyncBasis {
  return {
    direction: "capsule_to_google",
    fieldsOwnedByCapsule: [...CALENDAR_FIELDS_OWNED_BY_CAPSULE],
    startsFrom: Math.floor(connectedAt / DAY_MS) * DAY_MS,
    includePast,
    recordedAt: connectedAt,
  };
}

export function parseCalendarBasis(value: unknown): CalendarSyncBasis | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.direction !== "capsule_to_google" ||
    typeof record.startsFrom !== "number" ||
    typeof record.includePast !== "boolean" ||
    typeof record.recordedAt !== "number" ||
    !Array.isArray(record.fieldsOwnedByCapsule)
  ) {
    return null;
  }
  return {
    direction: "capsule_to_google",
    fieldsOwnedByCapsule: record.fieldsOwnedByCapsule.filter(
      (field): field is string => typeof field === "string",
    ),
    startsFrom: record.startsFrom,
    includePast: record.includePast,
    recordedAt: record.recordedAt,
  };
}

/**
 * Whether an event belongs on the calendar under the basis. A connection made
 * before the basis was recorded (basis null) keeps sending every event, as it
 * always did.
 */
export function eventInCalendarBasis(
  basis: CalendarSyncBasis | null,
  endsAt: number,
): boolean {
  return basis == null || basis.includePast || endsAt >= basis.startsFrom;
}
