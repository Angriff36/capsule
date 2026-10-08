import { useCallback, useMemo } from "react";
import { useConvex, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "./api";

/**
 * Indexed reads for the event screens (PL-SCALE): one event's (or one
 * client's) rows, never the whole company's table. Same read rule and row
 * shape as the generated lists. Event features must not import convex/react;
 * they call these.
 */

/** One event's invoices. */
export function useEventInvoices(eventId: string) {
  return useQuery(api.queries.listInvoiceByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's incidents. */
export function useEventIncidents(eventId: string) {
  return useQuery(api.queries.listIncidentByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's corrective actions. */
export function useEventCorrectiveActions(eventId: string) {
  return useQuery(api.queries.listCorrectiveActionByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's layout sections. */
export function useEventLayoutSections(eventId: string) {
  return useQuery(api.queries.listEventLayoutSectionByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One client's contacts; skipped until the client is known. */
export function useClientContacts(clientId: string | null | undefined) {
  return useQuery(
    api.queries.listClientContactByClientId,
    clientId ? { clientId: clientId as Id<"clients"> } : "skip",
  );
}

/** One proposal's menu dish picks; skipped without a proposal. */
export function useProposalDishSelections(proposalId: string) {
  return useQuery(
    api.queries.listProposalDishSelectionByProposalId,
    proposalId ? { proposalId: proposalId as Id<"proposals"> } : "skip",
  );
}

/** One proposal's enhancements; skipped without a proposal. */
export function useProposalEnhancements(proposalId: string) {
  return useQuery(
    api.queries.listProposalEnhancementByProposalId,
    proposalId ? { proposalId: proposalId as Id<"proposals"> } : "skip",
  );
}

/** One event's venue notes. */
export function useEventVenueNotes(eventId: string) {
  return useQuery(api.queries.listVenueNoteByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One menu line's ingredient overrides. */
export function useEventDishLineOverrides(eventDishId: string) {
  return useQuery(api.queries.listEventDishLineOverrideByEventDishId, {
    eventDishId: eventDishId as Id<"eventDishes">,
  });
}

/** One dish's recipe ingredient lines. */
export function useDishIngredientLines(dishId: string) {
  return useQuery(api.queries.listDishIngredientByDishId, {
    dishId: dishId as Id<"dishes">,
  });
}

/** One dish's sub-recipe lines. */
export function useDishComponentLines(dishId: string) {
  return useQuery(api.queries.listDishComponentByDishId, {
    dishId: dishId as Id<"dishes">,
  });
}

/** One event's payroll inputs; nothing is read without an event. */
export function useEventPayrollInputs(eventId: string) {
  return useQuery(
    api.queries.listPayrollInputByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}

/** One event's vendor orders. */
export function useEventVendorOrders(eventId: string) {
  return useQuery(api.queries.listVendorOrderByEventId, {
    eventId: eventId as Id<"events">,
  });
}

/** One vendor order's lines; skipped until the order is known. */
export function useVendorOrderLines(vendorOrderId: string | null | undefined) {
  return useQuery(
    api.queries.listVendorOrderLineByVendorOrderId,
    vendorOrderId
      ? { vendorOrderId: vendorOrderId as Id<"vendorOrders"> }
      : "skip",
  );
}

/** Invoices with this number; skipped without a number or tenant. */
export function useInvoicesByNumber(
  tenantId: string | null,
  invoiceNumber: string | undefined,
) {
  return useQuery(
    api.queries.listInvoiceByTenantIdAndInvoiceNumber,
    tenantId && invoiceNumber ? { tenantId, invoiceNumber } : "skip",
  );
}

/** Pack list lines of one event's pack lists. */
export function useEventPackItems(eventId: string) {
  return useQuery(api.eventsAreaWindow.packItemsForEvent, {
    eventId: eventId as Id<"events">,
  });
}

/** Waitlist entries of one event's staff needs. */
export function useEventWaitlistEntries(eventId: string) {
  return useQuery(api.eventsAreaWindow.waitlistForEvent, {
    eventId: eventId as Id<"events">,
  });
}

/** One event's needs, the order lines and links on them, and their orders. */
export function useEventPurchasing(eventId: string) {
  return useQuery(api.eventsAreaWindow.purchasingForEvent, {
    eventId: eventId as Id<"events">,
  });
}

/** Stock items, lots and holds for one event's ingredients. */
export function useEventStock(eventId: string) {
  return useQuery(api.eventsAreaWindow.stockForEvent, {
    eventId: eventId as Id<"events">,
  });
}

/** Fetches {@link useEventStock}'s rows once, at the moment of a sync. */
export function useEventStockLoader() {
  const convex = useConvex();
  return useCallback(
    (eventId: string) =>
      convex.query(api.eventsAreaWindow.stockForEvent, {
        eventId: eventId as Id<"events">,
      }),
    [convex],
  );
}

/**
 * Shifts overlapping [from, to): of these people when given, else of
 * everyone. Skipped until the window is known.
 */
export function useShiftsInWindow(
  window: { from: number; to: number; personIds?: string[] } | "skip",
) {
  return useQuery(api.eventsAreaWindow.shiftsInWindow, window);
}

/** Stable sorted id list, so a new array with the same ids reuses the read. */
function useIdKey(ids: ReadonlyArray<string> | undefined) {
  const key =
    ids === undefined ? undefined : [...new Set(ids)].sort().join(",");
  return useMemo(
    () => (key === undefined ? undefined : key ? key.split(",") : []),
    [key],
  );
}

/** Guests of these events (capacity counts only). */
export function useGuestsForEvents(
  eventIds: ReadonlyArray<string> | undefined,
) {
  const ids = useIdKey(eventIds);
  return useQuery(
    api.eventsAreaWindow.guestsForEvents,
    ids === undefined ? "skip" : { eventIds: ids },
  );
}

/** Invoices of these events. */
export function useInvoicesForEvents(
  eventIds: ReadonlyArray<string> | undefined,
) {
  const ids = useIdKey(eventIds);
  return useQuery(
    api.eventsAreaWindow.invoicesForEvents,
    ids === undefined ? "skip" : { eventIds: ids },
  );
}

/** Deliveries, invoices, trucks and given numbers of these events. */
export function useTrackerRows(eventIds: ReadonlyArray<string> | undefined) {
  const ids = useIdKey(eventIds);
  return useQuery(
    api.eventsAreaWindow.trackerRows,
    ids === undefined ? "skip" : { eventIds: ids },
  );
}

/** A BEO re-import's invoices, payments, and matched proposal/order lines. */
export function useImportDirectoryRows(
  invoiceNumber: string | null,
  proposalIds: ReadonlyArray<string> | undefined,
  vendorOrderIds: ReadonlyArray<string> | undefined,
) {
  const proposals = useIdKey(proposalIds);
  const orders = useIdKey(vendorOrderIds);
  return useQuery(
    api.eventsAreaWindow.importDirectoryRows,
    invoiceNumber && proposals && orders
      ? { invoiceNumber, proposalIds: proposals, vendorOrderIds: orders }
      : "skip",
  );
}

/** One event's ingredient needs; skipped without an event. */
export function useEventDemandsIfAny(eventId: string | undefined) {
  return useQuery(
    api.queries.listIngredientDemandByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
}
