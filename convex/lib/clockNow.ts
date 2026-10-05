/**
 * The clock a query reads. Convex re-runs a query only when its data or its
 * arguments change, so a page passes its current minute as `clock` and the
 * query reruns at least once a minute (release review 2026-09-29: scheduled
 * prices and link end dates on an open page). The later of the page's minute
 * and the server's time wins, so a page can never pass an old time to keep an
 * expired link open.
 */
export function clockNow(clock?: number): number {
  const now = Date.now();
  return typeof clock === "number" && Number.isFinite(clock)
    ? Math.max(now, clock)
    : now;
}
