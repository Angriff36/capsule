export type EquipmentReservationWindow = {
  tenantId: string;
  deletedAt?: number | null;
  startsAt: number | null;
  endsAt: number | null;
  quantity: number;
  status: string;
};

/** Half-open ranges: a return at 10:00 permits the next checkout at 10:00. */
export function overlappingReservationQuantity(
  reservations: readonly EquipmentReservationWindow[],
  input: { tenantId: string; startsAt: number; endsAt: number },
): number {
  return reservations
    .filter(
      (reservation) =>
        reservation.tenantId === input.tenantId &&
        reservation.deletedAt == null &&
        (reservation.status === "reserved" ||
          reservation.status === "checked_out") &&
        reservation.startsAt != null &&
        reservation.endsAt != null &&
        reservation.startsAt < input.endsAt &&
        reservation.endsAt > input.startsAt,
    )
    .reduce((sum, reservation) => sum + reservation.quantity, 0);
}

export function availableEquipmentQuantity(
  catalogQuantity: number,
  reservations: readonly EquipmentReservationWindow[],
  input: { tenantId: string; startsAt: number; endsAt: number },
): number {
  return (
    catalogQuantity - overlappingReservationQuantity(reservations, input)
  );
}
