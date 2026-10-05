import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * Hitch a trailer to a truck already on an event, keeping its riders and the
 * pack lines loaded on it. Feature pages must not import convex/react; call
 * this.
 */
export function useHitchTrailer() {
  return useMutation(api.rigTrailer.hitchTrailer);
}
