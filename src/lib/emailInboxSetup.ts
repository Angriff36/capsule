import { useQuery } from "convex/react";
import { api } from "./api";

/** The company's inbox address for client emails, and whether emails come in. */
export function useEmailInboxSetup() {
  return useQuery(api.emailInbox.emailSetup, {});
}
