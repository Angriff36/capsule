import { useMemo } from "react";
import { useListVehicleMaintenanceSchedule } from "../../lib/manifest-convex-react";
import { useVehicleOdometers } from "../facilities/useFacilitiesHistory";

/**
 * Service each truck is past due for, by date or by miles, named for a
 * warning next to the truck. A warning only: it never stops a booking.
 */
export function useOverdueVehicleService(): ReadonlyMap<string, string[]> {
  const schedules = useListVehicleMaintenanceSchedule();
  // Latest odometer reading of the trucks with a mileage schedule only.
  const mileageVehicleIds = useMemo(
    () =>
      schedules
        ?.filter(
          (row) => row.deletedAt == null && row.intervalType === "mileage",
        )
        .map((row) => String(row.vehicleId)),
    [schedules],
  );
  const odometers = useVehicleOdometers(mileageVehicleIds);
  return useMemo(() => {
    const odometer = new Map<string, number>(Object.entries(odometers ?? {}));
    const now = Date.now();
    const out = new Map<string, string[]>();
    for (const row of schedules ?? []) {
      if (row.deletedAt != null) continue;
      const id = String(row.vehicleId);
      const overdue =
        row.intervalType === "mileage"
          ? row.nextDueMileage != null &&
            (odometer.get(id) ?? 0) >= Number(row.nextDueMileage)
          : row.nextDueAt != null && Number(row.nextDueAt) < now;
      if (overdue) out.set(id, [...(out.get(id) ?? []), row.taskName]);
    }
    return out;
  }, [schedules, odometers]);
}
