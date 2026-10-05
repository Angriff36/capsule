import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * What happened on one event, newest first, in plain words. Event features
 * must not import convex/react; call this.
 */
export function useEventActivity(eventId: string | null | undefined) {
  return useQuery(
    api.eventActivity.listEventActivity,
    eventId ? { eventId } : "skip",
  );
}
