import { useQuery } from "convex/react";
import { api } from "./api";
import { useOfflineAuth } from "./offlineAuthContext";

/**
 * Shared auth-status read for authored UI. Event features must not import
 * `convex/react` directly (integration guard); call this instead.
 * When Convex never answers and ClaimGate restored a same-account snapshot,
 * that snapshot is returned so My Day can render the last confirmed day.
 */
export function useAuthStatus() {
  const live = useQuery(api.authStatus.getAuthStatus, {});
  const offline = useOfflineAuth();
  if (live?.accountId) return live;
  if (offline?.status) return offline.status;
  return live;
}
