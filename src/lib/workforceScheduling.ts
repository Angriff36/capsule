import { useMutation } from "convex/react";
import { api } from "./api";

/** Authored adapter for atomic shift creation with approved time-off blocking. */
export function useScheduleShift() {
  return useMutation(api.workforceScheduling.scheduleShift);
}
