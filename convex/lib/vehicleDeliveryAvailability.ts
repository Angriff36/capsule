export type VehicleDeliveryWindow = {
  _id: string;
  tenantId: string;
  deletedAt?: number | null;
  windowStartsAt?: number | null;
  windowEndsAt?: number | null;
  status: string;
  destination: string;
};

/**
 * Plain words for a truck or trailer that cannot go out, or null when it can
 * (PL-DELIVERY, AC-542). "In use" is fine: the window check handles clashes.
 */
export function vehicleStatusProblem(status: string): string | null {
  if (status === "maintenance") return "in the shop for maintenance";
  if (status === "out_of_service") return "out of service";
  if (status === "retired") return "retired";
  return null;
}

/** Half-open ranges: a window ending at 10:00 permits the next run at 10:00. */
export function conflictingVehicleDeliveries(
  deliveries: readonly VehicleDeliveryWindow[],
  input: {
    tenantId: string;
    startsAt: number;
    endsAt: number;
    excludeDeliveryId?: string;
  },
): VehicleDeliveryWindow[] {
  return deliveries.filter(
    (delivery) =>
      delivery._id !== input.excludeDeliveryId &&
      delivery.tenantId === input.tenantId &&
      delivery.deletedAt == null &&
      (delivery.status === "scheduled" || delivery.status === "in_transit") &&
      delivery.windowStartsAt != null &&
      delivery.windowEndsAt != null &&
      delivery.windowStartsAt < input.endsAt &&
      delivery.windowEndsAt > input.startsAt,
  );
}
