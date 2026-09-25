import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * Event features must not import convex/react; call this instead.
 */
export function useEventDuplicate() {
  return useMutation(api.lib.eventDuplicate.duplicateEvent);
}
