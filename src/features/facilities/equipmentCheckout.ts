import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";

/** Authored hook for the one atomic reservation-creation seam. */
export function useReserveEquipment() {
  return useMutation(api.equipmentCheckout.reserve);
}

/** Free counts, holds, condition and place of every item for one event
 * window (the event's own holds never count against it). */
export function useEquipmentAvailability(
  eventId: Id<"events">,
  startsAt: number,
  endsAt: number,
) {
  return useQuery(
    api.equipmentCheckout.equipmentAvailability,
    endsAt > startsAt ? { eventId, startsAt, endsAt } : "skip",
  );
}

/** Vendor names (no contact details) for picking who a rental comes from. */
export function useRentalVendorChoices() {
  return useQuery(api.equipmentCheckout.rentalVendorChoices, {});
}
