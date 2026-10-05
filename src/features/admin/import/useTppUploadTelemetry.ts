import { useCallback, useEffect, useRef, useState } from "react";
export type ImportStage =
  | "idle"
  | "indexing"
  | "ready"
  | "starting"
  | "preparing"
  | "uploading"
  | "importing"
  | "finalizing"
  | "paused"
  | "failed"
  | "complete"
  | "exceptions";
export type ImportTelemetry = {
  stage: ImportStage;
  startedAt: number;
  updatedAt: number;
  stageStartedAt: number;
  lastProgressAt: number;
  workerSeenAt?: number;
  batch?: number;
  collection?: string;
  batchBytes: number;
  sentBytes: number;
  savedBytes: number;
  savedBatches: number;
  attempt: number;
};
const initial = (): ImportTelemetry => ({
  stage: "idle",
  startedAt: Date.now(),
  updatedAt: Date.now(),
  stageStartedAt: Date.now(),
  lastProgressAt: Date.now(),
  batchBytes: 0,
  sentBytes: 0,
  savedBytes: 0,
  savedBatches: 0,
  attempt: 0,
});
export function useTppUploadTelemetry() {
  const [stats, setStats] = useState(initial);
  const current = useRef(stats);
  const events = useRef<Record<string, unknown>[]>([]);
  const failures = useRef<Record<string, unknown>[]>([]);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const changed = () => {
      setOnline(navigator.onLine);
      events.current.push({
        at: new Date().toISOString(),
        connection: navigator.onLine ? "online" : "offline",
      });
    };
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  const update = useCallback(
    (
      stage: ImportStage,
      patch: Partial<ImportTelemetry> = {},
      progress = true,
    ) => {
      const at = Date.now(),
        previous = current.current;
      const next = {
        ...previous,
        ...patch,
        stage,
        updatedAt: patch.updatedAt ?? at,
        stageStartedAt: stage === previous.stage ? previous.stageStartedAt : at,
        lastProgressAt: progress
          ? at
          : (patch.lastProgressAt ?? previous.lastProgressAt),
      };
      if (
        stage !== previous.stage ||
        next.batch !== previous.batch ||
        next.savedBatches !== previous.savedBatches
      )
        events.current.push({
          at: new Date(at).toISOString(),
          stage,
          batch: next.batch,
          collection: next.collection,
          savedBatches: next.savedBatches,
        });
      current.current = next;
      setStats(next);
    },
    [],
  );
  const reset = useCallback(() => {
    events.current = [];
    failures.current = [];
    const next = initial();
    current.current = next;
    setStats(next);
  }, []);
  const fail = useCallback(
    (error: unknown) => {
      failures.current.push({
        at: new Date().toISOString(),
        ...current.current,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      update("failed", {}, false);
    },
    [update],
  );
  const heartbeat = useCallback(() => {
    current.current.workerSeenAt = Date.now();
  }, []);
  return {
    stats,
    current,
    events,
    failures,
    now,
    online,
    update,
    reset,
    fail,
    heartbeat,
  };
}
