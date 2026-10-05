import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "./api";
import type { Id } from "./api";

/**
 * Opening an event asks Capsule once to move it on if its next stage's
 * conditions are met, and to book its next clock move (site comment #421).
 * Feature pages must not import convex/react; call this.
 */
export function useEventAutoStageCheck(eventId: Id<"events">) {
  const check = useMutation(api.eventAutoStage.check);
  useEffect(() => {
    void check({ eventId }).catch(() => undefined);
  }, [check, eventId]);
}
