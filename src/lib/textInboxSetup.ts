import { useQuery } from "convex/react";
import { api } from "./api";

/** The address Twilio sends client texts to, and whether texts are set up. */
export function useTextInboxSetup() {
  return useQuery(api.textInbox.textSetup, {});
}
