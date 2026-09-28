/**
 * AUTHOR SEAM — leadership-assigned todos + the clock-out blocker query.
 *
 * The Task entity's CRUD path goes through the generated Manifest hooks
 * (`useCreateTask`, `useTaskComplete`, etc.). This seam only owns the
 * cross-entity / time-bound queries that don't fit the manifest hook
 * shape: "what's open and due in the next 24h for this person".
 *
 * Powers the block-then-confirm clock-out warning in MyDayPage. Anything
 * status `pending` or `in_progress`, soft-deleted rows excluded, whose
 * dueAt sits inside today's server-local window.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

const STATUS_OPEN = ["pending", "in_progress"] as const;
type OpenStatus = (typeof STATUS_OPEN)[number];

function startOfLocalDay(now: Date): Date {
  const copy = new Date(now);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const openAndDueTodayForPerson = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.personId) {
      return [];
    }

    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    // Anything due within the current local day (today), inclusive of the
    // upper bound. Overdue (yesterday or earlier) is excluded by spec:
    // the warning fires on "due today + not done", not "everything open".
    const windowStart = dayStart.getTime();
    const windowEnd = dayEnd.getTime();

    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_assignedToId", (q) => q.eq("assignedToId", personId))
      .collect();

    return rows
      .filter((row) => row.tenantId === auth.tenantId)
      .filter((row) => row.deletedAt == null)
      .filter((row) => (STATUS_OPEN as readonly string[]).includes(row.status as OpenStatus))
      .filter((row) => row.dueAt >= windowStart && row.dueAt < windowEnd)
      .map((row) => ({
        _id: row._id,
        title: row.title,
        dueAt: row.dueAt,
        status: row.status,
      }))
      .sort((a, b) => a.dueAt - b.dueAt);
  },
});
