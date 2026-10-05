import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "./api";

/**
 * One event's menu lines (with each dish and its recipe, as the generated
 * every-event list gives them), never the whole company's (PL-SCALE). The
 * every-event list reads every menu line of every event with its recipe
 * tree, which passes Convex's read limits at 10,000 events. Event features
 * must not import convex/react; call this.
 */
export function useEventMenuLines(eventId: string | "skip") {
  return useQuery(
    api.queries.listEventDishByEventId,
    eventId === "skip" ? "skip" : { eventId: eventId as Id<"events"> },
  );
}
