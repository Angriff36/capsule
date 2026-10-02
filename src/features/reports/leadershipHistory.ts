import { isCompletedEvent } from "./dashboardRecordSets";

/**
 * L10 meeting-period history (spec §7.4): one row per week, Monday to Sunday
 * on this device's clock, newest first. Each row counts the priorities,
 * issues and to-dos opened and closed that week next to the week's completed
 * events and new leads, all from live records, so no meeting record has to
 * be kept by hand.
 */

export type LeadershipItemKind = "rock" | "issue" | "todo";
export type LeadershipItemStatus = "open" | "done" | "dropped";

export interface LeadershipItemRow {
  readonly _id: string;
  readonly kind: LeadershipItemKind;
  readonly title: string;
  readonly status: LeadershipItemStatus;
  readonly ownerPersonId?: string | null;
  readonly dueAt?: number | null;
  readonly notes?: string | null;
  readonly openedAt?: number | null;
  readonly closedAt?: number | null;
  readonly deletedAt?: number | null;
  readonly version?: number;
}

export const LEADERSHIP_KIND_LABEL: Record<LeadershipItemKind, string> = {
  rock: "Priority",
  issue: "Issue",
  todo: "To-do",
};

export interface HistoryEvent {
  readonly startsAt?: number | null;
  readonly stage?: string | null;
  readonly quotedPrice?: number | null;
}

export interface HistoryLead {
  readonly createdAt?: number | null;
}

export interface WeekRow {
  readonly weekStart: number;
  readonly opened: number;
  readonly done: number;
  readonly dropped: number;
  readonly completedEvents: number;
  readonly completedRevenue: number;
  readonly newLeads: number;
}

/** Monday 00:00 of the week holding `now`, on this device's clock. */
export function weekStartOf(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

export function liveItems(
  items: readonly LeadershipItemRow[],
): LeadershipItemRow[] {
  return items.filter((row) => row.deletedAt == null && row.openedAt != null);
}

export function weeklyHistory(
  input: {
    readonly items: readonly LeadershipItemRow[];
    readonly events: readonly HistoryEvent[];
    readonly leads: readonly HistoryLead[];
  },
  now: Date,
  weeks = 8,
): WeekRow[] {
  const items = liveItems(input.items);
  const thisWeek = weekStartOf(now);
  const rows: WeekRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const startDate = new Date(thisWeek);
    startDate.setDate(thisWeek.getDate() - 7 * i);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
    const from = startDate.getTime();
    const to = endDate.getTime();
    const within = (ts: number | null | undefined) =>
      ts != null && ts >= from && ts < to;
    const completed = input.events.filter(
      (e) => isCompletedEvent(e) && within(e.startsAt),
    );
    rows.push({
      weekStart: from,
      opened: items.filter((row) => within(row.openedAt)).length,
      done: items.filter((row) => row.status === "done" && within(row.closedAt))
        .length,
      dropped: items.filter(
        (row) => row.status === "dropped" && within(row.closedAt),
      ).length,
      completedEvents: completed.length,
      completedRevenue: completed.reduce(
        (sum, e) => sum + (e.quotedPrice ?? 0),
        0,
      ),
      newLeads: input.leads.filter((l) => within(l.createdAt)).length,
    });
  }
  return rows;
}

/** Days are whole local days; a due date before today is overdue. */
export function isOverdue(row: LeadershipItemRow, now: Date): boolean {
  if (row.status !== "open" || row.dueAt == null) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return row.dueAt < today.getTime();
}
