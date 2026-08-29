import type { KitchenSection } from "./kitchenRoutes";

/**
 * Keeps the last loaded catalog rows across route remounts (detail → index).
 * Keyed by tenant so a sign-out or organization switch in the same bundle
 * never paints the previous tenant's rows while the new query loads.
 */
export class KitchenCatalogDisplayCache {
  private static readonly rowsByKey = new Map<string, unknown[]>();

  private static key(
    tenantId: string | null | undefined,
    section: KitchenSection,
  ) {
    return `${tenantId ?? ""}::${section}`;
  }

  static read<T>(
    tenantId: string | null | undefined,
    section: KitchenSection,
  ): readonly T[] {
    if (!tenantId) return [];
    return (KitchenCatalogDisplayCache.rowsByKey.get(
      KitchenCatalogDisplayCache.key(tenantId, section),
    ) ?? []) as readonly T[];
  }

  static write<T>(
    tenantId: string | null | undefined,
    section: KitchenSection,
    rows: readonly T[],
  ): void {
    if (!tenantId || rows.length === 0) return;
    KitchenCatalogDisplayCache.rowsByKey.set(
      KitchenCatalogDisplayCache.key(tenantId, section),
      [...rows],
    );
  }
}
