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

/** PL-RETURNS: an event's equipment problems, late returns, money and the
 * duties a cancelled event still has. Null for roles that may not see it. */
export function useEventEquipmentExceptions(eventId: string | null) {
  return useQuery(
    api.equipmentCheckout.eventEquipmentExceptions,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

/** PL-VENDOR-POLICY: the event venue's vendor rules (preferred, approved,
 * restricted, banned) in force on the event's date. */
export function useVenueVendorRules(eventId: Id<"events">) {
  return useQuery(api.venueVendorPolicy.forEvent, { eventId });
}

/** Words after a vendor's name in a picker; banned ones cannot be picked. */
export const VENUE_VENDOR_NOTE: Record<string, string> = {
  preferred: " - the venue's preferred vendor",
  approved: " - approved by the venue",
  restricted: " - restricted at this venue, check with the venue first",
  banned: " - not allowed at this venue",
};

/** Vendor names (no contact details) for picking who a rental comes from. */
export function useRentalVendorChoices() {
  return useQuery(api.equipmentCheckout.rentalVendorChoices, {});
}
