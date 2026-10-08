import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../lib/api";

// Facilities and fleet reads of only what a screen shows
// (convex/facilitiesHistoryWindow.ts). Each is `undefined` while loading.

const HOUR_MS = 3_600_000;

const idsKey = (ids: readonly string[] | undefined) =>
  ids === undefined ? undefined : [...new Set(ids)].sort().join(",");
const fromKey = (key: string) => (key ? key.split(",") : []);

/** Latest service and service count of each maintenance task shown. */
export function useEquipmentServiceSummary(
  taskIds: readonly string[] | undefined,
) {
  const key = idsKey(taskIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { taskIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.facilitiesHistoryWindow.equipmentServiceSummary, args);
}

/**
 * Maintenance tasks due within `withinMs` from now, overdue ones included.
 * The read moves once an hour; callers keep their own exact cut-off.
 */
export function useMaintenanceDueWithin(withinMs: number) {
  const hour = Math.ceil((Date.now() + withinMs) / HOUR_MS) * HOUR_MS;
  return useQuery(api.facilitiesHistoryWindow.maintenanceDueBefore, {
    before: hour,
  });
}

/** Current odometer of each of these trucks (latest readings). */
export function useVehicleOdometers(vehicleIds: readonly string[] | undefined) {
  const key = idsKey(vehicleIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { vehicleIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.facilitiesHistoryWindow.vehicleOdometers, args);
}

/** The newest `limit` fuel and service entries, with the company's counts. */
export function useVehicleLogPage(limit: number) {
  return useQuery(api.facilitiesHistoryWindow.vehicleLogPage, { limit });
}

/** One month's rental holds, vendor lines and equipment problems. */
export function useRentalMonth(from: number, to: number) {
  return useQuery(api.facilitiesHistoryWindow.rentalMonth, { from, to });
}

/** Leads sent through any lead source linked to a venue. */
export function useVenueLeads(
  sources:
    | readonly {
        _id: string;
        venueId?: string | null;
        deletedAt?: number | null;
      }[]
    | undefined,
) {
  const key = idsKey(
    sources
      ?.filter((source) => source.deletedAt == null && source.venueId)
      .map((source) => String(source._id)),
  );
  const args = useMemo(
    () => (key === undefined ? "skip" : { sourceIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.facilitiesHistoryWindow.leadsForSources, args);
}

/** The notes of these venues. */
export function useVenuesNotes(venueIds: readonly string[] | undefined) {
  const key = idsKey(venueIds);
  const args = useMemo(
    () => (key === undefined ? "skip" : { venueIds: fromKey(key) }),
    [key],
  );
  return useQuery(api.facilitiesHistoryWindow.notesForVenues, args);
}

/** Every live event at this venue, light rows. */
export function useVenueEvents(venueId: string) {
  return useQuery(api.facilitiesHistoryWindow.venueEvents, { venueId });
}
