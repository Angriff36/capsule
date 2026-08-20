type SoftDelete = { deletedAt?: unknown };

export type EventMenuContainer = SoftDelete & {
  id: string;
  dishId: string;
  name: string;
  servingsPerContainer: number | string;
  baseQuantity?: number | string | null;
  status?: string | null;
};

export type EventMenuContainerCount = {
  containerId: string;
  dishId: string;
  name: string;
  servingsPerContainer: number;
  count: number;
};

/** Pack count for headcount: ceil(servings / servingsPerContainer) + base extras. */
export function eventMenuContainerCount(
  servings: number,
  servingsPerContainer: number,
  baseQuantity = 0,
): number {
  const per = Number(servingsPerContainer);
  const guests = Number(servings);
  const extra = Number(baseQuantity);
  if (!Number.isFinite(per) || per < 1) return 0;
  if (!Number.isFinite(guests) || guests <= 0) {
    return Number.isFinite(extra) && extra > 0 ? extra : 0;
  }
  const packed = Math.ceil(guests / per);
  return packed + (Number.isFinite(extra) && extra > 0 ? extra : 0);
}

export function eventMenuContainerCountsForDish(
  dishId: string,
  servings: number,
  containers: readonly EventMenuContainer[],
): EventMenuContainerCount[] {
  return containers
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.dishId === dishId &&
        (row.status == null || row.status === "active"),
    )
    .map((row) => {
      const servingsPerContainer = Number(row.servingsPerContainer);
      return {
        containerId: row.id,
        dishId: row.dishId,
        name: row.name,
        servingsPerContainer,
        count: eventMenuContainerCount(
          servings,
          servingsPerContainer,
          Number(row.baseQuantity ?? 0),
        ),
      };
    })
    .filter((row) => row.count > 0);
}

/** Explicit pans on the event line win over dish-record computed packs. */
export function eventMenuLinePanCount(
  explicitCount: number | null | undefined,
  servings: number,
  dishId: string,
  containers: readonly EventMenuContainer[],
): number {
  const explicit = Number(explicitCount);
  if (explicitCount != null && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  return eventMenuContainerCountsForDish(dishId, servings, containers).reduce(
    (sum, row) => sum + row.count,
    0,
  );
}

/** Value for the event-menu Pans number input: explicit/notes count, else computed packs. */
export function eventMenuPansInputValue(
  explicitCount: number | null | undefined,
  computedCount = 0,
): number | "" {
  if (explicitCount != null && Number.isFinite(Number(explicitCount))) {
    return Number(explicitCount);
  }
  return computedCount > 0 ? computedCount : "";
}
