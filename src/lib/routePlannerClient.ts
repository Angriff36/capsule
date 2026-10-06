import { useAction } from "convex/react";
import { api } from "./api";

/**
 * Authored seam for the hand-written routePlanner Convex action (real road
 * time between a run's stops). Lives in src/lib because feature trees are
 * guarded against direct convex/react hook construction.
 */
export function useRouteDriveLegs() {
  return useAction(api.routePlanner.driveLegs);
}
