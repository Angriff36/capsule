import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";

/** Authored adapter for atomic shift creation with approved time-off blocking. */
export function useScheduleShift() {
  return useMutation(api.workforceScheduling.scheduleShift);
}

/** Who can take one staffing need, best first, and why others can't. */
export function useStaffSuggestions(needId: string | null) {
  return useQuery(
    api.workforceScheduling.suggestStaffForNeed,
    needId ? { needId: needId as Id<"eventStaffNeeds"> } : "skip",
  );
}

/** Fill an event's open needs with suggested people only. */
export function useAutoFillEventStaffNeeds() {
  return useMutation(api.workforceScheduling.autoFillEventStaffNeeds);
}
