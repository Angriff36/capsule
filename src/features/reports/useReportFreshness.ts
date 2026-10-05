import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import type { ReportFreshness } from "./reportSnapshot";

/**
 * Live while the screen's connection to Capsule is open. When it drops the
 * figures on screen stop changing, so the report must stop calling them
 * current; lastLiveAt says from when they are.
 */
export function useReportFreshness(): ReportFreshness {
  const connection = useConvexConnectionState();
  const live = connection.isWebSocketConnected;
  const [lastLiveAt, setLastLiveAt] = useState<number | null>(
    live ? Date.now() : null,
  );
  useEffect(() => {
    if (!live) return;
    setLastLiveAt(Date.now());
    const timer = window.setInterval(() => setLastLiveAt(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [live]);
  return { live: live || !connection.hasEverConnected, lastLiveAt };
}
