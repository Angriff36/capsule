// Seam hooks for convex/logisticsWindow.ts and the indexed generated lists.
// Lives in facilities (the unguarded seam-hook home) because the logistics
// and inventory guards forbid convex/react in their own directories. Screens
// use these instead of the whole-table useList* hooks, which load every row
// the company ever had and ran out of time on the live server.
import { useCallback, useMemo } from "react";
import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";

type WindowPart =
  | "packLists"
  | "packLines"
  | "rigs"
  | "tripChecks"
  | "reservations"
  | "deliveries"
  | "departureOverrides"
  | "assignments"
  | "staffNeeds"
  | "issues";

/**
 * The asked-for rows of these events (convex/logisticsWindow.ts
 * `forEvents`, at most 1000 events). `undefined` while the ids or the rows
 * are loading.
 */
export function useLogisticsForEvents(
  eventIds: ReadonlyArray<string | null | undefined> | undefined,
  parts: readonly WindowPart[],
) {
  const key =
    eventIds === undefined
      ? undefined
      : [...new Set(eventIds.filter((id): id is string => !!id))]
          .sort()
          .join(",");
  const partsKey = parts.join(",");
  const args = useMemo(
    () =>
      key === undefined
        ? undefined
        : {
            eventIds: key ? key.split(",") : [],
            parts: partsKey.split(",") as WindowPart[],
          },
    [key, partsKey],
  );
  return useQuery(api.logisticsWindow.forEvents, args ?? "skip");
}

type PackStatus =
  "draft" | "packing" | "packed" | "loaded" | "dispatched" | "cancelled";

/** Pack lists in these statuses, with their lines when asked; "skip" reads
 * nothing. */
export function usePackListsByStatus(
  statuses: readonly PackStatus[] | "skip",
  withLines: boolean,
) {
  const key = statuses === "skip" ? null : statuses.join(",");
  const args = useMemo(
    () =>
      key === null
        ? "skip"
        : { statuses: key.split(",") as PackStatus[], withLines },
    [key, withLines],
  );
  return useQuery(api.logisticsWindow.packListsByStatus, args);
}

type DeliveryStatus =
  "scheduled" | "in_transit" | "delivered" | "failed" | "cancelled";

/** Deliveries in these statuses; "skip" reads nothing. */
export function useDeliveriesByStatus(
  statuses: readonly DeliveryStatus[] | "skip",
) {
  const key = statuses === "skip" ? null : statuses.join(",");
  const args = useMemo(
    () =>
      key === null ? "skip" : { statuses: key.split(",") as DeliveryStatus[] },
    [key],
  );
  return useQuery(api.logisticsWindow.deliveriesByStatus, args);
}

/** Equipment issues still open. */
export function useOpenEquipmentIssues() {
  return useQuery(api.logisticsWindow.openEquipmentIssues, {});
}

/** Reads every hold on the given pieces when called (scan lookups). */
export function useEquipmentHoldsLookup() {
  const convex = useConvex();
  return useCallback(
    (equipmentIds: string[]) =>
      convex.query(api.logisticsWindow.holdsForEquipment, { equipmentIds }),
    [convex],
  );
}

/** One pack list's lines; `undefined` while loading or the id is unknown. */
export function usePackListItemsFor(packListId: string | null | undefined) {
  return useQuery(
    api.queries.listPackListItemByPackListId,
    packListId ? { packListId: packListId as Id<"packLists"> } : "skip",
  );
}

/** Reads one pack list's lines when called. */
export function usePackListItemsLookup() {
  const convex = useConvex();
  return useCallback(
    (packListId: string) =>
      convex.query(api.queries.listPackListItemByPackListId, {
        packListId: packListId as Id<"packLists">,
      }),
    [convex],
  );
}

/** Who has taken which section of one pack list. */
export function usePackSectionClaimsFor(packListId: string | null | undefined) {
  return useQuery(
    api.queries.listPackSectionClaimByPackListId,
    packListId ? { packListId: packListId as Id<"packLists"> } : "skip",
  );
}

/** The trucks, trailers and vendor drops on one event now. */
export function useActiveEventRigs(eventId: string | null | undefined) {
  return useQuery(
    api.queries.listEventVehicleAssignmentByActiveEventId,
    eventId ? { activeEventId: eventId } : "skip",
  );
}

/** Trip checks of one truck run. */
export function useTripChecksForRun(runId: string | null | undefined) {
  return useQuery(
    api.queries.listVehicleTripCheckByEventVehicleAssignmentId,
    runId
      ? { eventVehicleAssignmentId: runId as Id<"eventVehicleAssignments"> }
      : "skip",
  );
}

/** Deliveries of one pack list. */
export function useDeliveriesForPack(packListId: string | null | undefined) {
  return useQuery(
    api.queries.listDeliveryByPackListId,
    packListId ? { packListId: packListId as Id<"packLists"> } : "skip",
  );
}

const PACK_LIST_PAGE = 50;

/**
 * Pack lists for the list page: one event's lists when the page follows an
 * event, otherwise the newest 50 with more on request. `rows` is
 * `undefined` while the first rows load.
 */
export function usePackListPages(eventId: string | null | undefined) {
  const own = useQuery(
    api.queries.listPackListByEventId,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.logisticsWindow.packListPage,
    eventId ? "skip" : {},
    { initialNumItems: PACK_LIST_PAGE },
  );
  if (eventId) return { rows: own, canLoadMore: false, loadMore: () => {} };
  return {
    rows: status === "LoadingFirstPage" ? undefined : results,
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(PACK_LIST_PAGE),
  };
}

const PARTNER_YEARS_MS = 2 * 365 * 86_400_000;

/**
 * Events of these venues from the last two years (what a partner scorecard
 * counts). `undefined` while the venues or the events are loading. The read
 * moves once a day, not on every render.
 */
export function useVenueScorecardEvents(
  venueIds: readonly string[] | undefined,
) {
  const key =
    venueIds === undefined ? undefined : [...venueIds].sort().join(",");
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const args = useMemo(
    () =>
      key === undefined
        ? "skip"
        : {
            venueIds: key ? key.split(",") : [],
            from: today - PARTNER_YEARS_MS,
          },
    [key, today],
  );
  return useQuery(api.logisticsWindow.venueEventsSince, args);
}

/** One vendor order's lines, links, received lots, and the needs and
 * demands it fills; each `undefined` while loading. */
export function useVendorOrderRows(vendorOrderId: string | null | undefined) {
  const args = vendorOrderId
    ? { vendorOrderId: vendorOrderId as Id<"vendorOrders"> }
    : "skip";
  return {
    lines: useQuery(api.queries.listVendorOrderLineByVendorOrderId, args),
    links: useQuery(api.queries.listVendorOrderLineDemandByVendorOrderId, args),
    lots: useQuery(api.queries.listInventoryLotByVendorOrderId, args),
    filled: useQuery(
      api.logisticsWindow.vendorOrderNeeds,
      vendorOrderId ? { vendorOrderId } : "skip",
    ),
  };
}

/** Every purchase need, only while `enabled` (a picker that offers them). */
export function usePurchaseNeedsWhen(enabled: boolean) {
  return useQuery(api.queries.listPurchaseNeed, enabled ? {} : "skip");
}

/** Bill matches of one order line. */
export function useBillMatchesForLine(lineId: string) {
  return useQuery(api.queries.listVendorBillMatchByVendorOrderLineId, {
    vendorOrderLineId: lineId as Id<"vendorOrderLines">,
  });
}

/** Receipt corrections of one order line. */
export function useReceiptCorrectionsForLine(lineId: string) {
  return useQuery(api.queries.listReceiptCorrectionByVendorOrderLineId, {
    vendorOrderLineId: lineId as Id<"vendorOrderLines">,
  });
}

const VENDOR_ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "submitted",
  "confirmed",
  "partially_received",
  "received",
  "cancelled",
] as const;
type VendorOrderStatus = (typeof VENDOR_ORDER_STATUSES)[number];

/**
 * Vendor orders in the given statuses, through the status index, each with
 * its lines (`lines`, as the generated list paints them). `undefined` until
 * all have loaded.
 */
export function useVendorOrdersInStatuses(
  statuses: readonly VendorOrderStatus[],
) {
  // One read per status; a status not asked for reads nothing.
  const read = (status: VendorOrderStatus) =>
    statuses.includes(status)
      ? // The server reads the caller's own tenant; this argument is unused.
        { tenantId: "", status }
      : "skip";
  const parts = [
    useQuery(api.queries.listVendorOrderByTenantIdAndStatus, read("draft")),
    useQuery(
      api.queries.listVendorOrderByTenantIdAndStatus,
      read("pending_approval"),
    ),
    useQuery(api.queries.listVendorOrderByTenantIdAndStatus, read("submitted")),
    useQuery(api.queries.listVendorOrderByTenantIdAndStatus, read("confirmed")),
    useQuery(
      api.queries.listVendorOrderByTenantIdAndStatus,
      read("partially_received"),
    ),
    useQuery(api.queries.listVendorOrderByTenantIdAndStatus, read("received")),
    useQuery(api.queries.listVendorOrderByTenantIdAndStatus, read("cancelled")),
  ];
  const rows: NonNullable<(typeof parts)[number]> = [];
  for (let n = 0; n < VENDOR_ORDER_STATUSES.length; n++) {
    if (!statuses.includes(VENDOR_ORDER_STATUSES[n]!)) continue;
    const part = parts[n];
    if (part === undefined) return undefined;
    rows.push(...part);
  }
  return rows;
}
