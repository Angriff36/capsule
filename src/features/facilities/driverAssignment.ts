import { useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hooks for the atomic driver-assignment seam. */
export function useAssignDriver() {
  return useMutation(api.driverAssignment.assign);
}

export function useUnassignDriver() {
  return useMutation(api.driverAssignment.unassign);
}
