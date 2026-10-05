import { useAction, useQuery } from "convex/react";
import { api, type Id } from "./api";

/**
 * Whether Google Calendar took one event, and a way to send it again. Event
 * features must not import convex/react; call these.
 */
export function useEventCalendarSyncMarker(eventId: Id<"events">) {
  return useQuery(api.googleCalendarHealth.eventSyncMarker, { eventId });
}

export function useRetryEventCalendarSync() {
  return useAction(api.googleCalendar.retryEvent);
}
