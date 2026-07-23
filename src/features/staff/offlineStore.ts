import { useEffect, useRef, useState } from "react";

// ponytail: offline bridge for the mobile My Day view. Venue wifi is often
// flaky, so the critical read paths (tasks, pack items, time records, shifts)
// are mirrored to localStorage and write commands are queued until the
// connection returns. A stable idempotencyKey is attached to every queued
// write so a replay can never double-apply. Move to IndexedDB + a service
// worker if larger payloads or true background sync ever matter.

export type MutationRunner = (
  args: Record<string, unknown>,
) => Promise<unknown>;

const CACHE_PREFIX = "capsule.my-day.cache.";
const QUEUE_KEY = "capsule.my-day.queue";
const QUEUE_EVENT = "capsule:my-day-queue";
const CACHE_WRITE_DEBOUNCE_MS = 400;

export interface QueuedAction {
  id: string;
  /** Stable key identifying which mutation to run, e.g. "clock-in". */
  runKey: string;
  /** Human label shown in the pending list, e.g. "Clock in". */
  label: string;
  /** Serializable args object passed to the mutation runner. */
  args: Record<string, unknown>;
  /** Stable idempotency key so a replayed write can't double-apply. */
  idempotencyKey: string;
  queuedAt: number;
  /** Set when the last sync attempt for this action failed. */
  lastError?: string;
}

// ---------- online status ----------

let online = typeof navigator !== "undefined" ? navigator.onLine : true;
const onlineListeners = new Set<(online: boolean) => void>();

function publishOnline(): void {
  for (const listener of onlineListeners) listener(online);
}

function bindBrowser(): void {
  if (typeof window === "undefined") return;
  const up = () => {
    online = true;
    publishOnline();
  };
  const down = () => {
    online = false;
    publishOnline();
  };
  window.addEventListener("online", up);
  window.addEventListener("offline", down);
}

let bound = false;
function ensureBound(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  bindBrowser();
}

export function isOnline(): boolean {
  ensureBound();
  return online;
}

export function subscribeOnline(
  listener: (online: boolean) => void,
): () => void {
  ensureBound();
  onlineListeners.add(listener);
  listener(online);
  return () => {
    onlineListeners.delete(listener);
  };
}

// ---------- read cache ----------

interface CachedSlot<T> {
  data: T;
  cachedAt: number;
}

export function readCache<T>(slot: string): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slot);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedSlot<T>;
    return parsed?.data;
  } catch {
    return undefined;
  }
}

function writeCache<T>(slot: string, data: T): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + slot,
      JSON.stringify({ data, cachedAt: Date.now() } satisfies CachedSlot<T>),
    );
  } catch {
    // Storage unavailable or full — reads just won't survive a reload.
  }
}

export function cacheAgeMs(slot: string): number | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slot);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedSlot<unknown>;
    return typeof parsed.cachedAt === "number" ? parsed.cachedAt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the live snapshot when available, otherwise the last cached
 * snapshot. Writes cache through to localStorage (debounced) whenever fresh
 * live data arrives, so the cache survives a reload while offline.
 */
export function useCachedRead<T>(
  slot: string,
  live: T | undefined,
): T | undefined {
  const [cached, setCached] = useState<T | undefined>(() => readCache<T>(slot));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (live === undefined) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeCache(slot, live);
      setCached(live);
    }, CACHE_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [slot, live]);

  return live ?? cached;
}

// ---------- write queue ----------

function isQueuedAction(value: unknown): value is QueuedAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.runKey === "string" &&
    typeof v.label === "string" &&
    v.args !== null &&
    typeof v.args === "object" &&
    typeof v.idempotencyKey === "string" &&
    typeof v.queuedAt === "number"
  );
}

export function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedAction);
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    // Storage unavailable — the action just won't persist across reloads.
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function enqueueAction(
  action: Omit<QueuedAction, "id" | "idempotencyKey" | "queuedAt">,
): QueuedAction {
  const full: QueuedAction = {
    ...action,
    id: newId(),
    idempotencyKey: newId(),
    queuedAt: Date.now(),
  };
  saveQueue([...loadQueue(), full]);
  return full;
}

export function removeAction(id: string): void {
  saveQueue(loadQueue().filter((action) => action.id !== id));
}

export function updateAction(
  id: string,
  patch: Partial<Pick<QueuedAction, "lastError">>,
): void {
  saveQueue(
    loadQueue().map((action) =>
      action.id === id ? { ...action, ...patch } : action,
    ),
  );
}

export function clearQueue(): void {
  saveQueue([]);
}

/** Reactive view of the pending write queue. */
export function useQueuedActions(): QueuedAction[] {
  const [queue, setQueue] = useState<QueuedAction[]>(loadQueue);
  useEffect(() => {
    const sync = () => setQueue(loadQueue());
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return queue;
}

export function useOnlineStatus(): boolean {
  const [value, setValue] = useState(() => isOnline());
  useEffect(() => subscribeOnline(setValue), []);
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Replay queued writes head-first so dependent actions (claim → start →
 * complete) keep their order. Stops on the first failure so a bad head does
 * not strand later writes that depend on it. Unknown runKeys (schema drift
 * or a stale entry from an older build) are dropped so they never block the
 * head. Each call gets the runners as they currently are; the component owns
 * the registry so this module stays free of mutation-specific knowledge.
 */
export async function drainQueue(
  runners: Record<string, MutationRunner>,
): Promise<void> {
  let sawFailure = false;
  while (!sawFailure) {
    const action = loadQueue()[0];
    if (!action) return;
    const runner = runners[action.runKey];
    if (!runner) {
      removeAction(action.id);
      continue;
    }
    try {
      await runner({ ...action.args, idempotencyKey: action.idempotencyKey });
      removeAction(action.id);
    } catch (error) {
      updateAction(action.id, { lastError: errorMessage(error) });
      sawFailure = true;
    }
  }
}

/**
 * Replays the pending queue through `runners` whenever the browser is online
 * and there are queued actions. `runners` is read through a ref so the latest
 * hook-generated mutation functions are used without re-triggering the effect
 * on every render. A signature guard prevents hot-looping when the head action
 * keeps failing — the drain only re-fires when online state or queue length
 * actually changes.
 */
export function useOfflineSync(runnersRef: {
  current: Record<string, MutationRunner>;
}): void {
  const online = useOnlineStatus();
  const queue = useQueuedActions();
  const draining = useRef(false);
  const lastSignature = useRef("");
  useEffect(() => {
    const signature = `${online ? "on" : "off"}:${queue.length}`;
    if (
      !online ||
      queue.length === 0 ||
      draining.current ||
      signature === lastSignature.current
    ) {
      return;
    }
    lastSignature.current = signature;
    draining.current = true;
    void drainQueue(runnersRef.current).finally(() => {
      draining.current = false;
      lastSignature.current = `${online ? "on" : "off"}:${loadQueue().length}`;
    });
  }, [online, queue, runnersRef]);
}
