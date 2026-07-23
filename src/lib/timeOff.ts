export interface TimeOffRange {
  personId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  status: string;
  deletedAt?: number | null;
}

export interface ProposedShiftRange {
  personId: string;
  startsAt: number;
  endsAt: number;
}

/** Half-open ranges: time off ending at 09:00 permits a 09:00 shift. */
export function findApprovedTimeOffConflict<T extends TimeOffRange>(
  requests: readonly T[],
  shift: ProposedShiftRange,
): T | undefined {
  return requests.find(
    (request) =>
      request.deletedAt == null &&
      request.status === "approved" &&
      request.personId === shift.personId &&
      request.startsAt != null &&
      request.endsAt != null &&
      request.startsAt < shift.endsAt &&
      request.endsAt > shift.startsAt,
  );
}
