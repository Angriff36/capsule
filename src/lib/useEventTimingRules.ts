import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";
import type { EventTimingRules } from "../../convex/eventTimingRules";
import type { WaitingShiftChange } from "../../convex/shiftTimingChanges";

/**
 * Company timing rules for one event, and shift time changes waiting for a
 * manager (PL-TIMING). Event features must not import convex/react; call
 * these instead.
 */
export function useEventTimingRules(
  eventId: Id<"events">,
): EventTimingRules | null | undefined {
  return useQuery(api.eventTimingRules.getEventTimingRules, { eventId });
}

export function useEventShiftChanges(
  eventId: Id<"events">,
): WaitingShiftChange[] | undefined {
  return useQuery(api.shiftTimingChanges.listEventShiftChanges, { eventId });
}

export function useApplyShiftTimingChange() {
  return useMutation(api.shiftTimingChanges.applyShiftTimingChange);
}

export function useKeepShiftTime() {
  return useMutation(api.shiftTimingChanges.keepShiftTime);
}
