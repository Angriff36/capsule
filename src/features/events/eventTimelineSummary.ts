import type {
  TimelineCategoryCount,
  TimelineSiteNote,
} from "./EventTimelineSidebar";

/** The run-sheet fields the right rail summarises. */
export type TimelineSummaryActivity = {
  readonly _id: string;
  readonly name: string;
  readonly category?: string | null;
  readonly siteNotes?: string | null;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
};

export function timelineCategoryCounts(
  activities: readonly TimelineSummaryActivity[],
): TimelineCategoryCount[] {
  const counts = new Map<string, number>();
  for (const activity of activities) {
    const label = (activity.category ?? "").trim() || "Uncategorised";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

export function timelineSiteNotes(
  activities: readonly TimelineSummaryActivity[],
): TimelineSiteNote[] {
  return activities
    .filter((activity) => (activity.siteNotes ?? "").trim().length > 0)
    .map((activity) => ({
      key: String(activity._id),
      activity: activity.name,
      note: String(activity.siteNotes),
    }));
}

/** First start and last end across the timed blocks. */
export function timelineWindow(
  activities: readonly TimelineSummaryActivity[],
): { start: number | null; end: number | null } {
  const starts = activities
    .map((activity) => Number(activity.startsAt ?? 0))
    .filter((value) => value > 0);
  const ends = activities
    .map((activity) => Number(activity.endsAt ?? activity.startsAt ?? 0))
    .filter((value) => value > 0);
  return {
    start: starts.length > 0 ? Math.min(...starts) : null,
    end: ends.length > 0 ? Math.max(...ends) : null,
  };
}
