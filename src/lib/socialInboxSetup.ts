import { useQuery } from "convex/react";
import { api } from "./api";

/** The address Meta sends client messages to, and whether they are set up. */
export function useSocialInboxSetup() {
  return useQuery(api.socialInbox.socialSetup, {});
}
