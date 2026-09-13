import { useQuery } from "convex/react";
import { api, type Id } from "./api";

type EventId = Id<"events"> | "skip";

/** Indexed relationship reads for the event coordination surface. */
export function useEventAssignmentRows(eventId: EventId) {
  return useQuery(
    api.queries.listEventAssignmentByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}

export function useEventStaffNeedRows(eventId: EventId) {
  return useQuery(
    api.queries.listEventStaffNeedByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}

export function useEventShiftRows(eventId: EventId) {
  return useQuery(
    api.queries.listShiftByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}
