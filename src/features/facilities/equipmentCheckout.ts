import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";

/** Authored hook for the one atomic reservation-creation seam. */
export function useReserveEquipment() {
  return useMutation(api.equipmentCheckout.reserve);
}

/** Vendor names (no contact details) for picking who a rental comes from. */
export function useRentalVendorChoices() {
  return useQuery(api.equipmentCheckout.rentalVendorChoices, {});
}
