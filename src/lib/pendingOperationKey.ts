type Pending<T> = { key: string; payload: T };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const volatile = new Map<string, Pending<unknown>>();
const confirmed = new Set<string>();
const storageKey = (scope: string) => `capsule:pending-operation:${scope}`;

export function beginPendingOperation<T>(
  scope: string,
  payload: T,
  deps: { storage?: StorageLike; randomUUID?: () => string } = {},
): Pending<T> {
  const storage = deps.storage ?? window.localStorage;
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const inMemory = volatile.get(scope) as Pending<T> | undefined;
  if (inMemory) return inMemory;
  if (!confirmed.has(scope)) {
    try {
      const raw = storage.getItem(storageKey(scope));
      if (raw) {
        const stored = JSON.parse(raw) as Pending<T>;
        if (stored?.key && stored.payload != null) {
          volatile.set(scope, stored);
          return stored;
        }
      }
    } catch {
      // Storage is navigation recovery, never a gate on submitting work.
    }
  }
  confirmed.delete(scope);
  const pending = { key: `${scope}:${randomUUID()}`, payload };
  volatile.set(scope, pending);
  try {
    storage.setItem(storageKey(scope), JSON.stringify(pending));
  } catch {
    // This tab can still retry safely from the frozen in-memory request.
  }
  return pending;
}

export function confirmPendingOperation(
  scope: string,
  storage: StorageLike = window.localStorage,
): void {
  volatile.delete(scope);
  confirmed.add(scope);
  try {
    storage.removeItem(storageKey(scope));
  } catch {
    // Backend success remains success. Ignore stale storage for this tab.
  }
}

export function resetPendingOperationsForTest(): void {
  volatile.clear();
  confirmed.clear();
}
