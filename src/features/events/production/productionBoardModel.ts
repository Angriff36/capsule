import type {
  EventDayActivity,
  EventDayBriefing,
} from "../../../lib/eventDayBriefing";

/**
 * The production board's figures (owner's Banani "Production Board",
 * 2026-10-14: "i wanted this screen in for the production meetings"), read
 * from the event-day briefing every crew screen already uses.
 */

const MINUTE = 60_000;
const DEFAULT_LENGTH = 30 * MINUTE;

export interface TimelineBar {
  readonly row: EventDayActivity;
  readonly start: number;
  readonly end: number;
  readonly lane: number;
}

export interface Timeline {
  readonly from: number;
  readonly to: number;
  readonly bars: readonly TimelineBar[];
  readonly lanes: number;
  /** Whole hours to label along the top. */
  readonly hours: readonly number[];
}

/**
 * Run-of-show rows with a start time, each in the first lane where it does
 * not overlap the row before it. Rows with no end run half an hour.
 */
export function buildTimeline(
  activities: readonly EventDayActivity[],
  eventStart: number | null,
  eventEnd: number | null,
): Timeline | null {
  const timed = activities
    .filter((row) => row.deletedAt == null && typeof row.startsAt === "number")
    .map((row) => {
      const start = Number(row.startsAt);
      const end =
        typeof row.endsAt === "number" && row.endsAt > start
          ? row.endsAt
          : start + DEFAULT_LENGTH;
      return { row, start, end };
    })
    .sort((a, b) => a.start - b.start);
  if (timed.length === 0) return null;
  const starts = timed.map((bar) => bar.start);
  const ends = timed.map((bar) => bar.end);
  if (eventStart != null) starts.push(eventStart);
  if (eventEnd != null) ends.push(eventEnd);
  const hour = 60 * MINUTE;
  const from = Math.floor(Math.min(...starts) / hour) * hour;
  const to = Math.ceil(Math.max(...ends) / hour) * hour;
  const laneEnds: number[] = [];
  const bars = timed.map((bar) => {
    let lane = laneEnds.findIndex((end) => end <= bar.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bar.end);
    } else laneEnds[lane] = bar.end;
    return { ...bar, lane };
  });
  const hours: number[] = [];
  const step = to - from > 12 * hour ? 2 * hour : hour;
  for (let time = from; time <= to; time += step) hours.push(time);
  return { from, to, bars, lanes: laneEnds.length, hours };
}

export interface BoardStats {
  readonly staffFilled: number;
  readonly staffWanted: number;
  readonly runsWithVehicle: number;
  readonly runs: number;
  readonly menuItems: number;
  readonly packed: number;
  readonly packLines: number;
  readonly tasksDone: number;
  readonly tasks: number;
}

export function boardStats(briefing: EventDayBriefing): BoardStats {
  const live = <T extends { deletedAt: number | null }>(rows: readonly T[]) =>
    rows.filter((row) => row.deletedAt == null);
  const staff = live(briefing.assignments).filter(
    (row) => String(row.status) !== "unassigned",
  );
  const needs = live(briefing.staffNeeds).filter((row) =>
    ["open", "claimed"].includes(String(row.status)),
  );
  const runs = live(briefing.deliveries).filter(
    (row) => String(row.status) !== "cancelled",
  );
  const lists = new Set(
    live(briefing.packLists)
      .filter((row) => String(row.status) !== "cancelled")
      .map((row) => row._id),
  );
  const lines = live(briefing.packListItems).filter((row) =>
    lists.has(row.packListId),
  );
  const tasks = live(briefing.activities);
  return {
    staffFilled: staff.length,
    staffWanted: staff.length + needs.length,
    runsWithVehicle: runs.filter((row) => row.vehicleId != null).length,
    runs: runs.length,
    menuItems: briefing.eventDishes.filter(
      (row) => row.removedAt == null && row.deletedAt == null,
    ).length,
    packed: lines.filter((row) =>
      ["packed", "loaded"].includes(String(row.status)),
    ).length,
    packLines: lines.length,
    tasksDone: tasks.filter((row) => row.completedAt != null).length,
    tasks: tasks.length,
  };
}

/** "in 2 d 4 h", "in 3 h 10 min", "running now", "over". */
export function untilText(
  start: number | null,
  end: number | null,
  now: number,
): string {
  if (start == null) return "No start time";
  if (now >= start) return end != null && now > end ? "Over" : "Running now";
  const minutes = Math.round((start - now) / MINUTE);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `in ${days} d ${hours} h`;
  if (hours > 0) return `in ${hours} h ${minutes % 60} min`;
  return `in ${minutes} min`;
}
