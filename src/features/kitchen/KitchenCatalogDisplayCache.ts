import type { KitchenSection } from "./kitchenRoutes";

/** Keeps the last loaded catalog rows across route remounts (detail → index). */
export class KitchenCatalogDisplayCache {
  private static readonly rowsBySection = new Map<KitchenSection, unknown[]>();

  static read<T>(section: KitchenSection): readonly T[] {
    return (KitchenCatalogDisplayCache.rowsBySection.get(section) ??
      []) as readonly T[];
  }

  static write<T>(section: KitchenSection, rows: readonly T[]): void {
    if (rows.length === 0) return;
    KitchenCatalogDisplayCache.rowsBySection.set(section, [...rows]);
  }
}
