/** One timeline block's times after a reorder. */
export type RemappedTimelineSlot = {
  readonly id: string;
  readonly startsAt: number;
  readonly endsAt: number | undefined;
  readonly sortOrder: number;
};

type TimedActivity = {
  readonly _id: string;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
};

/**
 * Rebuilds start/end times after a drag reorder while keeping each block's
 * duration and the gap sequence between neighbors.
 */
export class TimelineSlotRemapper {
  /**
   * @param previousOrderedIds - order before the drop (defines gaps + anchor)
   * @param nextOrderedIds - order after the drop (blocks keep their own durations)
   */
  remap(
    previousOrderedIds: readonly string[],
    nextOrderedIds: readonly string[],
    activitiesById: ReadonlyMap<string, TimedActivity>,
  ): RemappedTimelineSlot[] {
    const previous = previousOrderedIds
      .map((id) => activitiesById.get(id))
      .filter((row): row is TimedActivity => row != null);
    if (previous.length === 0 || nextOrderedIds.length === 0) return [];

    const gaps = this.gapsBetween(previous);
    const anchorStart = Number(previous[0]?.startsAt ?? 0);

    let cursor = anchorStart;
    return nextOrderedIds.map((id, index) => {
      const block = activitiesById.get(id);
      const duration = block ? this.durationMs(block) : 0;
      const startsAt = cursor;
      const rawEnd = block?.endsAt;
      const endsAt =
        typeof rawEnd === "number" ? startsAt + duration : undefined;
      if (index + 1 < nextOrderedIds.length) {
        cursor = (endsAt ?? startsAt) + (gaps[index] ?? 0);
      }
      return { id, startsAt, endsAt, sortOrder: index };
    });
  }

  private durationMs(row: TimedActivity): number {
    if (row.endsAt == null || row.startsAt == null) return 0;
    return Math.max(0, Number(row.endsAt) - Number(row.startsAt));
  }

  private gapsBetween(rows: readonly TimedActivity[]): number[] {
    const gaps: number[] = [];
    for (let index = 0; index < rows.length - 1; index += 1) {
      const current = rows[index];
      const next = rows[index + 1];
      if (current == null || next == null) {
        gaps.push(0);
        continue;
      }
      const currentEnd = Number(current.endsAt ?? current.startsAt ?? 0);
      const nextStart = Number(next.startsAt ?? 0);
      gaps.push(Math.max(0, nextStart - currentEnd));
    }
    return gaps;
  }
}
