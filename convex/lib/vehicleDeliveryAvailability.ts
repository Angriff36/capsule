export type VehicleDeliveryWindow = {
  _id: string;
  tenantId: string;
  deletedAt?: number | null;
  windowStartsAt?: number | null;
  windowEndsAt?: number | null;
  status: string;
  destination: string;
};

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
