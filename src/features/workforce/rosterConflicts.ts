/**
 * Roster conflicts (PR09-03 / AC-124): double bookings, approved time off
 * that landed on scheduled work, and a required certificate that runs out
 * before the work ends. These are shown to the manager; they never block
 * other work (an optional or unrelated certificate is never read here).
 */

type ShiftLike = {
  _id: string;
  personId: string;
  eventId?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  status: string;
  deletedAt?: number | null;
  requiredQualificationId?: string | null;
};

type TimeOffLike = {
  _id: string;
  personId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  status: string;
  deletedAt?: number | null;
};

type QualificationLike = {
  _id: string;
  name: string;
  expiresAt?: number | null;
  status: string;
  deletedAt?: number | null;
};

export type RosterConflict = {
  id: string;
  kind: "overlap" | "time_off" | "certificate_expiry";
  personId: string;
  eventIds: string[];
  startsAt: number;
  endsAt: number;
  message: string;
};

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dayOnly = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** "Oct 18, 5:00 PM – 10:00 PM" (end date repeated only when it differs). */
export function formatWindow(startsAt: number, endsAt: number): string {
  const sameDay = dayOnly.format(startsAt) === dayOnly.format(endsAt);
  return `${dateTime.format(startsAt)} – ${
    sameDay ? timeOnly.format(endsAt) : dateTime.format(endsAt)
  }`;
}

const live = (shift: ShiftLike) =>
  shift.deletedAt == null &&
  (shift.status === "scheduled" || shift.status === "started") &&
  shift.startsAt != null &&
  shift.endsAt != null;

export function findRosterConflicts(input: {
  shifts: readonly ShiftLike[];
  timeOff: readonly TimeOffLike[];
  qualifications: readonly QualificationLike[];
  eventTitle: (eventId: string | null | undefined) => string;
  personName: (personId: string) => string;
}): RosterConflict[] {
  const { eventTitle, personName } = input;
  const where = (shift: ShiftLike) =>
    shift.eventId ? eventTitle(shift.eventId) : "a shift with no event";
  const out: RosterConflict[] = [];
  const shifts = input.shifts
    .filter(live)
    .sort((a, b) => a.startsAt! - b.startsAt! || a._id.localeCompare(b._id));

  // Every overlapping pair for the same person, not only neighbours.
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i]!;
      const b = shifts[j]!;
      // Sorted by start: nothing later can overlap a once b starts after it.
      if (b.startsAt! >= a.endsAt!) break;
      if (a.personId !== b.personId) continue;
      const startsAt = b.startsAt!;
      const endsAt = Math.min(a.endsAt!, b.endsAt!);
      const places =
        a.eventId && a.eventId === b.eventId
          ? `twice on ${where(a)}`
          : `on ${where(a)} and ${where(b)}`;
      out.push({
        id: `overlap:${a._id}:${b._id}`,
        kind: "overlap",
        personId: a.personId,
        eventIds: [a.eventId, b.eventId].filter((id): id is string => !!id),
        startsAt,
        endsAt,
        message: `${personName(a.personId)} is booked ${places} at the same time (${formatWindow(startsAt, endsAt)}).`,
      });
    }
  }

  for (const shift of shifts) {
    const away = input.timeOff.find(
      (row) =>
        row.deletedAt == null &&
        row.status === "approved" &&
        row.personId === shift.personId &&
        row.startsAt != null &&
        row.endsAt != null &&
        row.startsAt < shift.endsAt! &&
        row.endsAt > shift.startsAt!,
    );
    if (away) {
      const startsAt = Math.max(away.startsAt!, shift.startsAt!);
      const endsAt = Math.min(away.endsAt!, shift.endsAt!);
      out.push({
        id: `time-off:${away._id}:${shift._id}`,
        kind: "time_off",
        personId: shift.personId,
        eventIds: shift.eventId ? [shift.eventId] : [],
        startsAt,
        endsAt,
        message: `${personName(shift.personId)} has approved time off during ${where(shift)} (${formatWindow(startsAt, endsAt)}).`,
      });
    }
    if (!shift.requiredQualificationId) continue;
    const certificate = input.qualifications.find(
      (row) => row._id === shift.requiredQualificationId,
    );
    if (!certificate || certificate.deletedAt != null) continue;
    const endsBefore =
      certificate.expiresAt != null && certificate.expiresAt < shift.endsAt!;
    if (certificate.status === "active" && !endsBefore) continue;
    out.push({
      id: `certificate:${certificate._id}:${shift._id}`,
      kind: "certificate_expiry",
      personId: shift.personId,
      eventIds: shift.eventId ? [shift.eventId] : [],
      startsAt: shift.startsAt!,
      endsAt: shift.endsAt!,
      message:
        certificate.status === "active"
          ? `${personName(shift.personId)}'s ${certificate.name} runs out on ${dayOnly.format(certificate.expiresAt!)}, before ${where(shift)} ends (${formatWindow(shift.startsAt!, shift.endsAt!)}).`
          : `${personName(shift.personId)}'s ${certificate.name} is no longer valid, and ${where(shift)} needs it (${formatWindow(shift.startsAt!, shift.endsAt!)}).`,
    });
  }

  return out.sort(
    (a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id),
  );
}
