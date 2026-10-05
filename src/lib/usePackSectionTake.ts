import { useMutation } from "convex/react";
import { api } from "./api";

/**
 * Take a section of a pack list: whoever had it gives it back and the
 * caller takes it, in one save. Feature pages must not import convex/react;
 * call this.
 */
export function usePackSectionTake() {
  return useMutation(api.packSections.take);
}
