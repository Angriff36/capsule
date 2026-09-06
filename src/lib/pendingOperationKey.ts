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
  let storage: StorageLike | undefined = deps.storage;
  if (!storage) {
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
  }
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const inMemory = volatile.get(scope) as Pending<T> | undefined;
  // Every consumer must submit to an authenticated, tenant-scoped parent
  // receipt. The stable key identifies the operation; current input may replace
  // an uncommitted invalid attempt. If the earlier attempt committed, the
  // parent receipt remains authoritative and returns its actual saved result.
  if (inMemory) {
    const current = { key: inMemory.key, payload };
    volatile.set(scope, current);
    try {
      storage?.setItem(storageKey(scope), JSON.stringify(current));
    } catch {
      // Navigation recovery is best effort.
    }
    return current;
  }
  const wasConfirmed = confirmed.has(scope);
  let storageAvailable = true;
  if (!wasConfirmed) {
    try {
      const raw = storage?.getItem(storageKey(scope));
      if (raw) {
        const stored = JSON.parse(raw) as Pending<T>;
        if (stored?.key && stored.payload != null) {
          const current = { key: stored.key, payload };
          volatile.set(scope, current);
          try {
            storage?.setItem(storageKey(scope), JSON.stringify(current));
          } catch {
            // Navigation recovery is best effort.
          }
          return current;
        }
      }
    } catch {
      storageAvailable = false;
      // Storage is navigation recovery, never a gate on submitting work.
    }
  }
  confirmed.delete(scope);
  let pending = {
    key: storageAvailable
      ? `${scope}:${randomUUID()}`
      : `${scope}:storage-unavailable`,
    payload,
  };
  volatile.set(scope, pending);
  try {
    if (!storage) throw new Error("Storage unavailable");
    storage.setItem(storageKey(scope), JSON.stringify(pending));
  } catch {
    pending = {
      key: wasConfirmed
        ? `${scope}:${randomUUID()}`
        : `${scope}:storage-unavailable`,
      payload,
    };
    volatile.set(scope, pending);
  }
  return pending;
}

export function confirmPendingOperation(
  scope: string,
  storage?: StorageLike,
): void {
  volatile.delete(scope);
  confirmed.add(scope);
  try {
    storage ??= window.localStorage;
    storage.removeItem(storageKey(scope));
  } catch {
    // Backend success remains success. Ignore stale storage for this tab.
  }
}

export function resetPendingOperationsForTest(): void {
  volatile.clear();
  confirmed.clear();
}
