import { useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hook for the one atomic reservation-creation seam. */
export function useReserveEquipment() {
  return useMutation(api.equipmentCheckout.reserve);
}
