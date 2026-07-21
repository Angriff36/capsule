import { useEffect, useState } from "react";

/** Tracks Convex-style undefined loading and surfaces a slow-load flag. */
export function useSlowQuery(
  value: unknown,
  timeoutMs = 10_000,
): { loading: boolean; loadingTooLong: boolean } {
  const loading = value === undefined;
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingTooLong(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadingTooLong(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [loading, timeoutMs]);

  return { loading, loadingTooLong: loading && loadingTooLong };
}
