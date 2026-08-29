/**
 * Shifts for event staff come from the event timeline: a person's shift is the
 * span of the timeline blocks they are assigned to, or the whole event window
 * when no block names them. The Staffing tab creates a Shift row from this on
 * assign (and on "Sync shifts") so the schedule and the roster agree.
 */
export type TimelineBlockRow = {
  readonly eventId: string;
  readonly deletedAt?: number | null;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly assigneePersonIds?: readonly string[] | null;
};

export type ShiftRow = {
  readonly _id: string;
  readonly personId: string;
  readonly eventId?: string | null;
  readonly status: string;
  readonly deletedAt?: number | null;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
};

export type ShiftWindow = {
  readonly startsAt: number;
  readonly endsAt: number;
};

export function shiftWindowFor(input: {
  readonly eventId: string;
  readonly personId: string;
  readonly activities: readonly TimelineBlockRow[] | undefined;
  readonly eventStartsAt?: number | null;
  readonly eventEndsAt?: number | null;
}): ShiftWindow | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const block of input.activities ?? []) {
    if (block.deletedAt != null || block.eventId !== input.eventId) continue;
    if (!(block.assigneePersonIds ?? []).includes(input.personId)) continue;
    if (block.startsAt == null || block.endsAt == null) continue;
    start = Math.min(start, Number(block.startsAt));
    end = Math.max(end, Number(block.endsAt));
  }
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return { startsAt: start, endsAt: end };
  }
  const eventStart = Number(input.eventStartsAt ?? 0);
  const eventEnd = Number(input.eventEndsAt ?? 0);
  if (eventStart > 0 && eventEnd > eventStart) {
    return { startsAt: eventStart, endsAt: eventEnd };
  }
  return null;
}

/** The live shift already scheduled for this person on this event, if any. */
export function eventShiftFor(
  shifts: readonly ShiftRow[] | undefined,
  eventId: string,
  personId: string,
): ShiftRow | undefined {
  return (shifts ?? []).find(
    (shift) =>
      shift.deletedAt == null &&
      shift.eventId === eventId &&
      shift.personId === personId &&
      shift.status !== "cancelled",
  );
}

/** Deterministic key so a retried assign never schedules a second shift. */
export function eventShiftIdempotencyKey(eventId: string, personId: string) {
  return `event-shift:${eventId}:${personId}`;
}
