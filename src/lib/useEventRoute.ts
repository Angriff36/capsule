import { useAction, useQuery } from "convex/react";
import { api, type Id } from "./api";
import type { EventRouteStatus } from "../../convex/eventRoutes";

/**
 * Kitchen-to-venue drive time for one event (PL-ROUTES). Event features must
 * not import convex/react; call these instead.
 */
export function useEventRoute(
  eventId: Id<"events">,
): EventRouteStatus | null | undefined {
  return useQuery(api.eventRoutes.getEventRoute, { eventId });
}

export function useRefreshEventRoute() {
  return useAction(api.eventRoutes.refreshEventRoute);
}
