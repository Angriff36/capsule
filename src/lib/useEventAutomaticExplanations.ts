import { useQuery } from "convex/react";
import { api, type Id } from "./api";
import type { AutomaticExplanation } from "./automaticExplanation";

/**
 * "Why is this here?" for everything Capsule made by itself on one event.
 * Event features must not import convex/react; call this instead.
 */
export function useEventAutomaticExplanations(
  eventId: Id<"events">,
): { eventId: string; items: AutomaticExplanation[] } | null | undefined {
  return useQuery(api.automaticExplanations.explainEventAutomaticWork, {
    eventId,
  });
}
