import { useEffect, useState } from "react";

const minute = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * The current minute, updated each minute. Public pages pass it to queries
 * that read the clock (scheduled prices, link end dates) so an open page
 * catches up within a minute; see convex/lib/clockNow.ts.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(minute);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(minute()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Keeps the last answer on screen while a query reruns for the next minute,
 * so the page does not flash "loading" once a minute.
 */
export function useLatestDefined<T>(value: T | undefined): T | undefined {
  const [latest, setLatest] = useState<T | undefined>(value);
  useEffect(() => {
    if (value !== undefined) setLatest(value);
  }, [value]);
  return value !== undefined ? value : latest;
}
