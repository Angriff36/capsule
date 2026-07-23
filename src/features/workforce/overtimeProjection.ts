export const DEFAULT_OVERTIME_THRESHOLD_HOURS = 40;

const COMMITTED_SHIFT_STATUSES = new Set(["scheduled", "started", "completed"]);

export interface ShiftProjectionInput {
  personId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  status: string;
  deletedAt?: number | null;
}

export interface ProposedShiftInput {
  personId: string;
  startsAt: number;
  endsAt: number;
}

export interface WeeklyHoursProjection {
  weekStartsAt: number;
  weekEndsAt: number;
  existingHours: number;
  proposedHours: number;
  projectedHours: number;
  thresholdHours: number;
  overtimeHours: number;
  exceedsThreshold: boolean;
}

interface ProjectWeeklyHoursOptions {
  shifts: readonly ShiftProjectionInput[];
  proposedShift: ProposedShiftInput;
  thresholdHours: number;
}

/**
 * Shift has no separate confirmed state: scheduled, started, and completed
 * rows are the committed schedule. Cancelled/no-show rows do not contribute.
 */
export function projectWeeklyHours({
  shifts,
  proposedShift,
  thresholdHours,
}: ProjectWeeklyHoursOptions): WeeklyHoursProjection[] {
  if (!isValidInterval(proposedShift.startsAt, proposedShift.endsAt)) return [];

  const projections: WeeklyHoursProjection[] = [];
  let segmentStartsAt = proposedShift.startsAt;

  while (segmentStartsAt < proposedShift.endsAt) {
    const weekStartsAt = startOfLocalWeek(segmentStartsAt);
    const weekEndsAt = startOfNextLocalWeek(weekStartsAt);
    const proposedHours =
      overlapDuration(
        proposedShift.startsAt,
        proposedShift.endsAt,
        weekStartsAt,
        weekEndsAt,
      ) / 3_600_000;
    const existingHours = shifts.reduce((total, shift) => {
      const startsAt = shift.startsAt;
      const endsAt = shift.endsAt;
      if (
        shift.personId !== proposedShift.personId ||
        shift.deletedAt != null ||
        !COMMITTED_SHIFT_STATUSES.has(shift.status) ||
        typeof startsAt !== "number" ||
        typeof endsAt !== "number" ||
        !isValidInterval(startsAt, endsAt)
      ) {
        return total;
      }
      return (
        total +
        overlapDuration(startsAt, endsAt, weekStartsAt, weekEndsAt) / 3_600_000
      );
    }, 0);
    const projectedHours = existingHours + proposedHours;
    const overtimeHours = Math.max(0, projectedHours - thresholdHours);

    projections.push({
      weekStartsAt,
      weekEndsAt,
      existingHours,
      proposedHours,
      projectedHours,
      thresholdHours,
      overtimeHours,
      exceedsThreshold: overtimeHours > 0,
    });

    segmentStartsAt = Math.min(proposedShift.endsAt, weekEndsAt);
  }

  return projections;
}

function startOfLocalWeek(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

function startOfNextLocalWeek(weekStartsAt: number): number {
  const date = new Date(weekStartsAt);
  date.setDate(date.getDate() + 7);
  return date.getTime();
}

function overlapDuration(
  startsAt: number,
  endsAt: number,
  windowStartsAt: number,
  windowEndsAt: number,
): number {
  return Math.max(
    0,
    Math.min(endsAt, windowEndsAt) - Math.max(startsAt, windowStartsAt),
  );
}

function isValidInterval(
  startsAt: number | null | undefined,
  endsAt: number | null | undefined,
): boolean {
  return (
    typeof startsAt === "number" &&
    typeof endsAt === "number" &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    endsAt > startsAt
  );
}
