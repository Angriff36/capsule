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

/** Only called after explicit user confirmation; sign-in never deletes older work. */
export function discardUnscopedQueuedWork(): void {
  localStorage.removeItem(QUEUE_KEY);
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

/** Older queues have no owner. Retain them, but never assign them to whoever signs in next. */
export function hasUnscopedQueuedWork(): boolean {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

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

export function readCache<T>(
  slot: string,
  scope: string | null = null,
): T | undefined {
  if (!scope) return undefined;
  try {
    const raw = localStorage.getItem(
      CACHE_PREFIX + encodeURIComponent(scope) + "." + slot,
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedSlot<T>;
    return parsed?.data;
  } catch {
    return undefined;
  }
}

function writeCache<T>(slot: string, data: T, scope: string): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + encodeURIComponent(scope) + "." + slot,
      JSON.stringify({ data, cachedAt: Date.now() } satisfies CachedSlot<T>),
    );
  } catch {
    // Storage unavailable or full — reads just won't survive a reload.
  }
}

export function cacheAgeMs(
  slot: string,
  scope: string | null = null,
): number | undefined {
  if (!scope) return undefined;
  try {
    const raw = localStorage.getItem(
      CACHE_PREFIX + encodeURIComponent(scope) + "." + slot,
    );
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
  scope: string | null = null,
): T | undefined {
  const [cached, setCached] = useState(() => ({
    scope,
    slot,
    data: readCache<T>(slot, scope),
  }));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (live === undefined || !scope) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeCache(slot, live, scope);
      setCached({ scope, slot, data: live });
    }, CACHE_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [slot, live, scope]);

  return (
    live ??
    (cached.scope === scope && cached.slot === slot
      ? cached.data
      : readCache<T>(slot, scope))
  );
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

export function loadQueue(scope: string | null = null): QueuedAction[] {
  if (!scope) return [];
  try {
    const raw = localStorage.getItem(
      QUEUE_KEY + "." + encodeURIComponent(scope),
    );
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedAction);
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[], scope: string): void {
  localStorage.setItem(
    QUEUE_KEY + "." + encodeURIComponent(scope),
    JSON.stringify(queue),
  );
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function enqueueAction(
  action: Omit<QueuedAction, "id" | "idempotencyKey" | "queuedAt">,
  scope: string | null = null,
): QueuedAction {
  if (!scope)
    throw new Error(
      "Your staff identity must be confirmed before saving offline work.",
    );
  const full: QueuedAction = {
    ...action,
    id: newId(),
    idempotencyKey: newId(),
    queuedAt: Date.now(),
  };
  saveQueue([...loadQueue(scope), full], scope);
  return full;
}

export function removeAction(id: string, scope: string): void {
  saveQueue(
    loadQueue(scope).filter((action) => action.id !== id),
    scope,
  );
}

export function updateAction(
  id: string,
  patch: Partial<Pick<QueuedAction, "lastError">>,
  scope: string,
): void {
  saveQueue(
    loadQueue(scope).map((action) =>
      action.id === id ? { ...action, ...patch } : action,
    ),
    scope,
  );
}

export function clearQueue(scope: string): void {
  saveQueue([], scope);
}

/** Reactive view of the pending write queue. */
export function useQueuedActions(scope: string | null = null): QueuedAction[] {
  const [queue, setQueue] = useState(() => ({ scope, rows: loadQueue(scope) }));
  useEffect(() => {
    const sync = () => setQueue({ scope, rows: loadQueue(scope) });
    sync();
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [scope]);
  return queue.scope === scope ? queue.rows : loadQueue(scope);
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
  scope: string | null = null,
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  if (!scope) return;
  let sawFailure = false;
  while (!sawFailure && stillCurrent()) {
    const action = loadQueue(scope)[0];
    if (!action) return;
    const runner = runners[action.runKey];
    if (!runner) {
      removeAction(action.id, scope);
      continue;
    }
    try {
      await runner({ ...action.args, idempotencyKey: action.idempotencyKey });
      removeAction(action.id, scope);
    } catch (error) {
      updateAction(action.id, { lastError: errorMessage(error) }, scope);
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
export function useOfflineSync(
  runnersRef: {
    current: Record<string, MutationRunner>;
  },
  scope: string | null = null,
): void {
  const online = useOnlineStatus();
  const queue = useQueuedActions(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const draining = useRef(false);
  const lastSignature = useRef("");
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    scopeRef.current = scope;
    return () => {
      scopeRef.current = null;
    };
  }, [scope]);
  useEffect(() => {
    const signature = `${scope}:${online ? "on" : "off"}:${queue.length}`;
    if (
      !scope ||
      !online ||
      queue.length === 0 ||
      draining.current ||
      signature === lastSignature.current
    ) {
      return;
    }
    lastSignature.current = signature;
    draining.current = true;
    void drainQueue(runnersRef.current, scope, () => scopeRef.current === scope)
      .catch(() => {
        // Preserve work if storage cannot record an acknowledgement.
      })
      .finally(() => {
        draining.current = false;
        if (scopeRef.current === scope)
          lastSignature.current = `${scope}:${online ? "on" : "off"}:${loadQueue(scope).length}`;
        if (scopeRef.current) setSettled((value) => value + 1);
      });
  }, [online, queue, runnersRef, scope, settled]);
}
