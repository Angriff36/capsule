import {
  useListTrailer,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import { useActiveEventRigs } from "../facilities/useLogisticsWindow";
import type { PackRig } from "./packViews";

type Named = { _id: string; make: string; model: string; registration: string };

function rigName(row: Named | undefined): string | null {
  if (!row) return null;
  const name = `${row.make} ${row.model}`.trim();
  return row.registration ? `${name} · ${row.registration}` : name;
}

/** The trucks, trailers and vendor drops on this event now, named for the
 * truck-load view. */
export function packRigs(
  eventId: string,
  assignments: Array<{
    _id: string;
    activeEventId?: string | null;
    vehicleId?: string | null;
    trailerId?: string | null;
    vendorName?: string | null;
    deletedAt?: number | null;
  }>,
  vehicles: Named[],
  trailers: Named[],
): PackRig[] {
  return assignments
    .filter((row) => row.deletedAt == null && row.activeEventId === eventId)
    .map((row) => {
      const parts = [
        rigName(vehicles.find((v) => v._id === row.vehicleId)),
        rigName(trailers.find((t) => t._id === row.trailerId)),
        row.vendorName?.trim() || null,
      ].filter((part): part is string => !!part);
      return { id: row._id, label: parts.join(" + ") || "Truck" };
    });
}

export function usePackRigs(eventId: string | null | undefined): PackRig[] {
  const assignments = useActiveEventRigs(eventId);
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  if (!eventId) return [];
  return packRigs(eventId, assignments ?? [], vehicles ?? [], trailers ?? []);
}
