import { useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "./api";

/**
 * One date-ordered window of events for the Events page, never the whole
 * table. Event features must not import convex/react; call this.
 */
export function useEventLedgerWindow(
  args: FunctionArgs<typeof api.eventLedger.ledgerWindow>,
) {
  return useQuery(api.eventLedger.ledgerWindow, args);
}
