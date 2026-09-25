import { useQuery } from "convex/react";
import { api, type Id } from "./api";
import type { EventReadinessProjection } from "../../convex/lib/eventReadinessProjection";

/**
 * Event features must not import convex/react; call this instead.
 */
export function useEventReadiness(
  eventId: Id<"events">,
): EventReadinessProjection | null | undefined {
  return useQuery(api.eventReadiness.getEventReadiness, {
    eventId,
  });
}
