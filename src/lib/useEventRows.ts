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

/** One event's review flags, never the whole company's (PL-SCALE). */
export function useEventReviewFlagRows(eventId: string) {
  return useQuery(api.queries.listReviewFlagByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's timeline comments, never the whole company's (PL-SCALE). */
export function useEventTimelineComments(eventId: string) {
  return useQuery(api.queries.listEventTimelineCommentByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's timeline blocks, never the whole company's (PL-SCALE). */
export function useEventTimelineActivities(eventId: string) {
  return useQuery(api.queries.listEventTimelineActivityByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's proposals, never the whole company's (PL-SCALE). */
export function useEventProposals(eventId: string) {
  return useQuery(api.queries.listProposalByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's pack lists, never the whole company's (PL-SCALE). */
export function useEventPackLists(eventId: string) {
  return useQuery(api.queries.listPackListByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's ingredient needs, never the whole company's (PL-SCALE). */
export function useEventIngredientDemands(eventId: string) {
  return useQuery(api.queries.listIngredientDemandByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's equipment holds, never the whole company's (PL-SCALE). */
export function useEventEquipmentReservations(eventId: string) {
  return useQuery(api.queries.listEquipmentReservationByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's rental order lines, never the whole company's (PL-SCALE). */
export function useEventRentalOrderLines(eventId: string) {
  return useQuery(api.queries.listRentalOrderLineByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's staff assignments, never the whole company's (PL-SCALE). */
export function useEventAssignments(eventId: string) {
  return useQuery(api.queries.listEventAssignmentByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's staff needs, never the whole company's (PL-SCALE). */
export function useEventStaffNeeds(eventId: string) {
  return useQuery(api.queries.listEventStaffNeedByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's shifts, never the whole company's (PL-SCALE). */
export function useEventShifts(eventId: string) {
  return useQuery(api.queries.listShiftByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's prep tasks, never the whole company's (PL-SCALE). */
export function useEventPrepTasks(eventId: string) {
  return useQuery(api.queries.listPrepTaskByEventId, {
    eventId: eventId as Id<"events">,
  });
}
