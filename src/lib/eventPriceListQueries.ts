import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";

// The proposal that holds an event's price lines, and whether the event's
// price follows it (convex/lib/eventPriceList.ts). `undefined` while loading,
// `null` when the event has no price list yet.
export const useEventPriceList = (eventId: Id<"events">) =>
  useQuery(api.lib.eventPriceList.forEvent, { eventId });

// One priced line added to a price list (the proposal line seam recomputes
// the totals; the event's price follows them).
export const useAddPriceListLine = () =>
  useMutation(api.lib.proposalPricing.addProposalLineAndRecompute);

// Change one line already on a price list.
export const useRevisePriceListLine = () =>
  useMutation(api.lib.proposalPricing.reviseProposalLineAndRecompute);
