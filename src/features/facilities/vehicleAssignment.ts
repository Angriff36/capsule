import { useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hooks for the atomic vehicle-assignment seam. */
export function useAssignVehicle() {
  return useMutation(api.vehicleAssignment.assign);
}

export function useUnassignVehicle() {
  return useMutation(api.vehicleAssignment.unassign);
}
