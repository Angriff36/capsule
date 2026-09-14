import { useAuth } from "@clerk/react";
import { useAuthStatus } from "./useAuthStatus";

/**
 * Survives a page unmount so Back does not flash empty lists.
 * Convex drops the subscription when the last reader unmounts; the next
 * mount briefly sees `undefined` (or the header treats that as zero).
 * Keyed by Clerk account AND tenant so an org switch never shows the
 * previous workspace's clients, dishes, or venues.
 */
export class HeldQueryRowCache {
  private readonly rows = new Map<string, readonly unknown[]>();

  hold<T>(
    key: string,
    current: readonly T[] | undefined,
  ): readonly T[] | undefined {
    if (current !== undefined) {
      this.rows.set(key, current);
      return current;
    }
    return this.rows.get(key) as readonly T[] | undefined;
  }

  clear(): void {
    this.rows.clear();
  }
}

export const heldQueryRowCache = new HeldQueryRowCache();

export function useHeldQueryRows<T>(
  key: string,
  current: T[] | undefined,
): T[] | undefined {
  const { userId } = useAuth();
  const auth = useAuthStatus();
  if (!auth?.tenantId) return current;
  const held = heldQueryRowCache.hold(
    `${userId ?? "signed-out"}:${auth.tenantId}:${key}`,
    current,
  );
  return held as T[] | undefined;
}
