/**
 * PL-ASSET-AVAILABILITY (PR10-03): what the reserve form says about one item
 * for this event's time - how many are free, what holds the rest, and which
 * other items of the same kind could stand in.
 */

export type AvailabilityConflict = {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly quantity: number;
  readonly overdue: boolean;
};

export type ItemAvailability = {
  readonly equipmentId: string;
  readonly name: string;
  readonly category: string;
  readonly condition: string;
  readonly location: string | null;
  readonly quantity: number;
  readonly free: number;
  /** PL-RETURNS: broken, being cleaned or in repair right now. */
  readonly outOfUse?: number;
  readonly blocked: "out_of_service" | "retired" | null;
  readonly conflicts: readonly AvailabilityConflict[];
};

/** Other items of the same kind that are bookable and have units free,
 * most free first. */
export function replacementsFor(
  item: ItemAvailability,
  all: readonly ItemAvailability[],
  wanted: number,
): ItemAvailability[] {
  const kind = item.category.trim().toLowerCase();
  return all
    .filter(
      (other) =>
        other.equipmentId !== item.equipmentId &&
        other.blocked == null &&
        other.free >= Math.max(1, wanted) &&
        kind.length > 0 &&
        other.category.trim().toLowerCase() === kind,
    )
    .sort((a, b) => b.free - a.free || a.name.localeCompare(b.name));
}

/** One plain line for the item's state: free count, place, condition. */
export function availabilitySummary(item: ItemAvailability): string {
  if (item.blocked === "out_of_service") {
    return "Out of service - it can't be booked until it is marked fixed.";
  }
  return [
    `${item.free} of ${item.quantity} free for this time`,
    item.outOfUse
      ? `${item.outOfUse} broken, being cleaned or in repair`
      : null,
    item.location ? `kept at ${item.location}` : null,
    `condition ${item.condition.replace(/_/g, " ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
