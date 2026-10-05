// Client seam for the authored convex/cascadePreview.ts query. Event feature
// roots may not construct Convex hooks themselves (Manifest integration
// guards), so the wrapper lives here beside culinaryDemandClient.ts.
import { useQuery } from "convex/react";
import { api, type Id } from "./api";

export type CascadeAction = "approve" | "closeOut";

/** What approving or closing out this event will create elsewhere. */
export const useEventCascadePreview = (
  eventId: string,
  action: CascadeAction,
) =>
  useQuery(api.cascadePreview.eventCascadePreview, {
    eventId: eventId as Id<"events">,
    action,
  });
