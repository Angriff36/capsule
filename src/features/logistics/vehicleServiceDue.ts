import { useMemo } from "react";
import {
  useListVehicleFuelLog,
  useListVehicleMaintenanceSchedule,
  useListVehicleServiceEntry,
} from "../../lib/manifest-convex-react";

/**
 * Service each truck is past due for, by date or by miles, named for a
 * warning next to the truck. A warning only: it never stops a booking.
 */
export function useOverdueVehicleService(): ReadonlyMap<string, string[]> {
  const schedules = useListVehicleMaintenanceSchedule();
  const fuel = useListVehicleFuelLog();
  const service = useListVehicleServiceEntry();
  return useMemo(() => {
    const odometer = new Map<string, number>();
    for (const row of [...(fuel ?? []), ...(service ?? [])]) {
      if (row.deletedAt != null) continue;
      const id = String(row.vehicleId);
      odometer.set(id, Math.max(odometer.get(id) ?? 0, Number(row.odometer)));
    }
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
  }, [schedules, fuel, service]);
}
