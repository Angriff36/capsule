export const RECURRING_EVENT_DRAFT_HORIZON_MS = 90 * 24 * 60 * 60 * 1_000;
export const RECURRING_EVENT_BATCH_LIMIT = 24;

export type EventRecurrenceFrequency = "weekly" | "monthly" | "annually";
export type EventRecurrenceEndCondition = "on_date" | "after_occurrences";

export interface EventRecurrenceBoundary {
  endCondition: EventRecurrenceEndCondition;
  recurrenceEndsAt?: number | null;
  occurrenceLimit?: number | null;
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function calendarOccurrence(
  anchorStartsAt: number,
  monthOffset: number,
  yearOffset: number,
): number {
  const anchor = new Date(anchorStartsAt);
  const absoluteMonth =
    anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12) + yearOffset;
  const month = absoluteMonth % 12;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return Date.UTC(
    year,
    month,
    day,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  );
}

/**
 * Return the start for a one-based occurrence sequence. Sequence 1 is the
 * source Event; generated Drafts begin at sequence 2.
 */
export function recurringEventStartsAt(
  anchorStartsAt: number,
  frequency: EventRecurrenceFrequency,
  sequence: number,
): number {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Recurring event sequence must be a positive integer");
  }
  const offset = sequence - 1;
  if (frequency === "weekly") {
    return anchorStartsAt + offset * 7 * 24 * 60 * 60 * 1_000;
  }
  if (frequency === "monthly") {
    return calendarOccurrence(anchorStartsAt, offset, 0);
  }
  return calendarOccurrence(anchorStartsAt, 0, offset);
}

export function recurrenceIncludesSequence(
  boundary: EventRecurrenceBoundary,
  startsAt: number,
  sequence: number,
): boolean {
  if (boundary.endCondition === "on_date") {
    return (
      typeof boundary.recurrenceEndsAt === "number" &&
      startsAt <= boundary.recurrenceEndsAt
    );
  }
  return (
    typeof boundary.occurrenceLimit === "number" &&
    sequence <= boundary.occurrenceLimit
  );
}

export function nextRecurringEventSweepAt(
  nextStartsAt: number,
  now: number,
): number {
  return Math.max(now + 1_000, nextStartsAt - RECURRING_EVENT_DRAFT_HORIZON_MS);
}
