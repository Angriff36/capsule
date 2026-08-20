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
