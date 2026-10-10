import { useAction, useQuery } from "convex/react";
import { api } from "./api";

/** The address Meta sends client messages to, and whether they are set up. */
export function useSocialInboxSetup() {
  return useQuery(api.socialInbox.socialSetup, {});
}

/** When the company's Facebook Page key was saved (never the key). */
export function useSocialPageKeyStatus() {
  return useQuery(api.socialReply.pageKeyStatus, {});
}

/** Managers save (or, empty, remove) the Facebook Page key. */
export function useSaveSocialPageKey() {
  return useAction(api.socialReply.savePageKey);
}
