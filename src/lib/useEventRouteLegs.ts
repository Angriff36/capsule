import { useQuery } from "convex/react";
import { api, type Id } from "./api";

/**
 * Each truck's, vendor's and the main crew's times for one event
 * (PL-ROUTE-LEGS). Event features must not import convex/react; call this.
 */
export function useEventRouteLegs(eventId: Id<"events">) {
  return useQuery(api.eventRouteLegs.getEventRouteLegs, { eventId });
}

/**
 * Stops with crew, truck loads against what they carry, and each pack line's
 * truck, trip, loading zone and food hold time (PL-DELIVERY). Skipped with no
 * event.
 */
export function useEventTransport(eventId: Id<"events"> | null | undefined) {
  return useQuery(
    api.eventRouteLegs.getEventTransport,
    eventId ? { eventId } : "skip",
  );
}
