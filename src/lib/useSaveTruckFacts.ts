import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * Save a truck's seats, driver certificate, cargo space and hitch in one
 * save: all of it is kept, or none of it. Feature pages must not import
 * convex/react; call this.
 */
export function useSaveTruckFacts() {
  return useMutation(api.rigTrailer.saveTruckFacts);
}
