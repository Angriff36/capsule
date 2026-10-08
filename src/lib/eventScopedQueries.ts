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

export function useEventTaskRows(eventId: EventId) {
  return useQuery(
    api.queries.listEventTaskByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}

export function usePlanningReceiptRows(eventId: EventId) {
  return useQuery(
    api.queries.listPlanningReceiptByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}

export function usePlanningOverrideRows(eventId: EventId) {
  return useQuery(
    api.queries.listPlanningOverrideByEventId,
    eventId === "skip" ? "skip" : { eventId },
  );
}

/** Staff, trucks, holds and pack lists of the given events only. */
export function usePlanWindowRows(eventIds: string[] | "skip") {
  return useQuery(
    api.planWindow.forEvents,
    eventIds === "skip" ? "skip" : { eventIds },
  );
}
