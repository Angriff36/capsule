import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api, type Id } from "./api";

/** Minimal participant context; generated commands still own every write. */
export function useRelatedSwapShifts() {
  return useQuery(api.staffShiftSwaps.listRelatedShifts, {});
}

export function useSwapCandidates(shiftId: string | null, now: number) {
  return useQuery(
    api.staffShiftSwaps.getCandidates,
    shiftId ? { shiftId: shiftId as Id<"shifts">, now } : "skip",
  );
}

/** Refresh at the next start even when no record changes; resume after sleep. */
export function useSwapNow(shifts: { startsAt?: number | null }[] | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const nextStart = (shifts ?? []).reduce(
    (next, shift) =>
      shift.startsAt != null && shift.startsAt > now
        ? Math.min(next, shift.startsAt)
        : next,
    Infinity,
  );
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const boundary = Number.isFinite(nextStart)
      ? window.setTimeout(refresh, Math.min(nextStart - now + 1, 2_147_483_647))
      : undefined;
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(boundary);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [nextStart, now]);
  return now;
}
