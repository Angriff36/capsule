export type EquipmentReservationWindow = {
  _id?: string;
  tenantId: string;
  eventId?: string;
  deletedAt?: number | null;
  startsAt: number | null;
  endsAt: number | null;
  quantity: number;
  status: string;
};

type WindowInput = {
  tenantId: string;
  startsAt: number;
  endsAt: number;
  /** PL-ASSET-AVAILABILITY: a hold still checked out after its return time is
   * still out of the building, so it keeps its units until someone checks it
   * back in. Without `now`, holds count only inside their own window. */
  now?: number;
  /** Holds of this event are its own and never compete with it. */
  excludeEventId?: string;
};

/** When a hold really ends: its return time, or never while it is overdue. */
function effectiveEnd(
  reservation: EquipmentReservationWindow,
  now: number | undefined,
): number {
  const endsAt = reservation.endsAt as number;
  if (
    now != null &&
    reservation.status === "checked_out" &&
    endsAt <= now
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return endsAt;
}

/** Half-open ranges: a return at 10:00 permits the next checkout at 10:00. */
export function overlappingReservations<T extends EquipmentReservationWindow>(
  reservations: readonly T[],
  input: WindowInput,
): T[] {
  return reservations.filter(
    (reservation) =>
      reservation.tenantId === input.tenantId &&
      reservation.deletedAt == null &&
      (input.excludeEventId == null ||
        reservation.eventId !== input.excludeEventId) &&
      (reservation.status === "reserved" ||
        reservation.status === "checked_out") &&
      reservation.startsAt != null &&
      reservation.endsAt != null &&
      reservation.startsAt < input.endsAt &&
      effectiveEnd(reservation, input.now) > input.startsAt,
  );
}

export function overlappingReservationQuantity(
  reservations: readonly EquipmentReservationWindow[],
  input: WindowInput,
): number {
  return overlappingReservations(reservations, input).reduce(
    (sum, reservation) => sum + reservation.quantity,
    0,
  );
}

export function availableEquipmentQuantity(
  catalogQuantity: number,
  reservations: readonly EquipmentReservationWindow[],
  input: WindowInput,
): number {
  return (
    catalogQuantity - overlappingReservationQuantity(reservations, input)
  );
}

export type EquipmentIssueHold = {
  tenantId: string;
  deletedAt?: number | null;
  status: string;
  holdsUnits: boolean;
  quantity: number;
};

/** PL-RETURNS: units kept out of use by open problems (broken, being
 * cleaned, in repair) until someone marks the problem sorted out. They are
 * out for every date, not only one window. */
export function unitsOutOfUse(
  issues: readonly EquipmentIssueHold[],
  tenantId: string,
): number {
  return issues
    .filter(
      (issue) =>
        issue.tenantId === tenantId &&
        issue.deletedAt == null &&
        issue.status === "open" &&
        issue.holdsUnits,
    )
    .reduce((sum, issue) => sum + Number(issue.quantity), 0);
}

/** Why a catalog line cannot be booked at all, whatever the count. */
export type EquipmentBlock = "out_of_service" | "retired" | null;

export function equipmentBlock(equipment: {
  status: string;
  condition: string;
}): EquipmentBlock {
  if (equipment.status !== "active") return "retired";
  if (equipment.condition === "out_of_service") return "out_of_service";
  return null;
}

export type EquipmentConflict = {
  reservationId: string;
  eventId: string;
  startsAt: number;
  endsAt: number;
  quantity: number;
  status: string;
  /** Checked out and past its return time, still not back. */
  overdue: boolean;
};

/** Every hold that takes units in the window, with what the office needs to
 * see: which event, when, how many, and whether it is late coming back. */
export function equipmentConflicts(
  reservations: readonly EquipmentReservationWindow[],
  input: WindowInput,
): EquipmentConflict[] {
  return overlappingReservations(reservations, input)
    .map((reservation) => ({
      reservationId: String(reservation._id ?? ""),
      eventId: String(reservation.eventId ?? ""),
      startsAt: reservation.startsAt as number,
      endsAt: reservation.endsAt as number,
      quantity: reservation.quantity,
      status: reservation.status,
      overdue:
        input.now != null &&
        reservation.status === "checked_out" &&
        (reservation.endsAt as number) <= input.now,
    }))
    .sort((a, b) => a.startsAt - b.startsAt);
}
