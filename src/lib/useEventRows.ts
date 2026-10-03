import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "./api";

/**
 * One event's guests, never the whole company's guest list (PL-SCALE). Same
 * read rule and row shape as the generated list. Event features must not
 * import convex/react; call this.
 */
export function useEventGuests(eventId: string) {
  return useQuery(api.queries.listEventGuestByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's prep tasks, never the whole company's (PL-SCALE). */
export function useEventPrepTasks(eventId: string) {
  return useQuery(api.queries.listPrepTaskByEventId, {
    eventId: eventId as Id<"events">,
  });
}
