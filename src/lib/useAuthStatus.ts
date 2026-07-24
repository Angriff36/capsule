import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * Shared auth-status read for authored UI. Event features must not import
 * `convex/react` directly (integration guard); call this instead.
 */
export function useAuthStatus() {
  return useQuery(api.authStatus.getAuthStatus, {});
}
