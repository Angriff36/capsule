import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * Put a checklist on an event in one save: a to-do for each line that is not
 * there yet. Feature pages must not import convex/react; call this.
 */
export function useEventChecklistApply() {
  return useMutation(api.eventChecklistApply.apply);
}
