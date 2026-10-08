// The prep tasks, batches and their links the kitchen screens need, read
// through indexes. The prep board, kitchen display and production plan used
// to load the generated lists whole (every prep task, link, check, comment,
// batch and share the company ever had); on the live server those loads ran
// out of time.
//
// Same read rules as the generated list queries (kitchenAccess or
// manageAccess; quality checks kitchenAccess only); a kind the caller may
// not read comes back empty, as those lists do. Deleted rows are left out as
// the lists leave them out (task links have no deletedAt).
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Prep statuses still on someone's list. */
const OPEN_TASK_STATUSES = [
  "pending",
  "claimed",
  "in_progress",
  "blocked",
] as const;

/** Event stages that still need kitchen work (the plan's rule). */
const UNFINISHED_STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
] as const;

/** At most this many events per read, like eventLookup's RANGE_CAP. */
export const EVENT_CAP = 3000;

const DAY = 86_400_000;

type Batch = Doc<"productionBatches"> & { yieldVariance: number };

const withVariance = (row: Doc<"productionBatches">): Batch => ({
  ...row,
  yieldVariance:
    row.actualYield == null ? 0 : row.actualYield - row.plannedYield,
});

function rules(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  return {
    kitchen: canRead(auth, ["kitchenAccess", "manageAccess"]),
    checks: canRead(auth, ["kitchenAccess"]),
  };
}

async function tasksOfEvents(
  ctx: QueryCtx,
  tenantId: string,
  eventIds: Iterable<Id<"events">>,
): Promise<Doc<"prepTasks">[]> {
  const out: Doc<"prepTasks">[] = [];
  for (const eventId of eventIds)
    for (const row of await ctx.db
      .query("prepTasks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect())
      if (row.tenantId === tenantId && row.deletedAt == null) out.push(row);
  return out;
}

async function windowEventIds(
  ctx: QueryCtx,
  tenantId: string,
  from: number,
  to: number,
): Promise<Id<"events">[]> {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_tenantId_and_startsAt", (q) =>
      q.eq("tenantId", tenantId).gte("startsAt", from).lt("startsAt", to),
    )
    .take(EVENT_CAP);
  return rows.map((row) => row._id);
}

/**
 * The prep work a board shows: every open prep task (any date), every task
 * of those tasks' events (done siblings count toward "already made"), every
 * task of the events that start in [from, to) when a window is given, the
 * links into and out of those tasks (and the tasks at their other end, so a
 * waiting step names what it waits for), their quality checks, and the
 * comments on their events.
 */
export const prepWork = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { from, to }) => {
    const auth = await getAuthContext(ctx);
    const empty = {
      tasks: [] as Doc<"prepTasks">[],
      dependencies: [] as Doc<"prepTaskDependencies">[],
      checks: [] as Doc<"qualityChecks">[],
      comments: [] as Doc<"prepTaskComments">[],
    };
    const read = rules(auth);
    if (!auth.tenantId || !read.kitchen) return empty;
    const tenantId = auth.tenantId;

    const eventIds = new Set<Id<"events">>();
    for (const status of OPEN_TASK_STATUSES)
      for (const row of await ctx.db
        .query("prepTasks")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", status),
        )
        .collect())
        if (row.deletedAt == null) eventIds.add(row.eventId);
    if (from != null && to != null)
      for (const id of await windowEventIds(ctx, tenantId, from, to))
        eventIds.add(id);

    const tasks = await tasksOfEvents(ctx, tenantId, eventIds);
    const taskIds = new Set<string>(tasks.map((task) => task._id));

    const links = new Map<string, Doc<"prepTaskDependencies">>();
    for (const task of tasks) {
      for (const row of await ctx.db
        .query("prepTaskDependencies")
        .withIndex("by_dependentTaskId", (q) =>
          q.eq("dependentTaskId", task._id),
        )
        .collect())
        if (row.tenantId === tenantId) links.set(row._id, row);
      for (const row of await ctx.db
        .query("prepTaskDependencies")
        .withIndex("by_predecessorTaskId", (q) =>
          q.eq("predecessorTaskId", task._id),
        )
        .collect())
        if (row.tenantId === tenantId) links.set(row._id, row);
    }
    // A link can reach a task of another event: read that task too.
    for (const link of links.values())
      for (const id of [link.dependentTaskId, link.predecessorTaskId]) {
        if (taskIds.has(id)) continue;
        taskIds.add(id);
        const row = await ctx.db.get(id);
        if (row && row.tenantId === tenantId && row.deletedAt == null)
          tasks.push(row);
      }

    const checks: Doc<"qualityChecks">[] = [];
    if (read.checks)
      for (const task of tasks)
        for (const row of await ctx.db
          .query("qualityChecks")
          .withIndex("by_prepTaskId", (q) => q.eq("prepTaskId", task._id))
          .collect())
          if (row.tenantId === tenantId && row.deletedAt == null)
            checks.push(row);

    const comments: Doc<"prepTaskComments">[] = [];
    for (const eventId of eventIds)
      for (const row of await ctx.db
        .query("prepTaskComments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (row.tenantId === tenantId && row.deletedAt == null)
          comments.push(row);

    return { tasks, dependencies: [...links.values()], checks, comments };
  },
});

/**
 * What the production plan reads: the prep tasks, task links, batches and
 * batch shares of every event that is not finished or cancelled (the plan
 * leaves those out), plus a batch made for another event that shares to
 * one of them. The ids of those events come back too.
 */
export const planWork = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const empty = {
      eventIds: [] as Id<"events">[],
      tasks: [] as Doc<"prepTasks">[],
      dependencies: [] as Doc<"prepTaskDependencies">[],
      batches: [] as Batch[],
      allocations: [] as Doc<"productionBatchAllocations">[],
    };
    const read = rules(auth);
    if (!auth.tenantId || !read.kitchen) return empty;
    const tenantId = auth.tenantId;

    const eventIds: Id<"events">[] = [];
    for (const stage of UNFINISHED_STAGES) {
      if (eventIds.length >= EVENT_CAP) break;
      for (const row of await ctx.db
        .query("events")
        .withIndex("by_tenantId_and_stage_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("stage", stage),
        )
        .take(EVENT_CAP - eventIds.length))
        if (row.deletedAt == null) eventIds.push(row._id);
    }

    const tasks = await tasksOfEvents(ctx, tenantId, eventIds);
    const dependencies: Doc<"prepTaskDependencies">[] = [];
    for (const task of tasks)
      for (const row of await ctx.db
        .query("prepTaskDependencies")
        .withIndex("by_dependentTaskId", (q) =>
          q.eq("dependentTaskId", task._id),
        )
        .collect())
        if (row.tenantId === tenantId) dependencies.push(row);

    const batches = new Map<string, Batch>();
    const allocations: Doc<"productionBatchAllocations">[] = [];
    for (const eventId of eventIds) {
      for (const row of await ctx.db
        .query("productionBatches")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (row.tenantId === tenantId && row.deletedAt == null)
          batches.set(row._id, withVariance(row));
      for (const row of await ctx.db
        .query("productionBatchAllocations")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (row.tenantId === tenantId && row.deletedAt == null)
          allocations.push(row);
    }
    for (const share of allocations) {
      if (batches.has(share.productionBatchId)) continue;
      const row = await ctx.db.get(share.productionBatchId);
      if (row && row.tenantId === tenantId && row.deletedAt == null)
        batches.set(row._id, withVariance(row));
    }
    // Shares of these batches for other events still belong to the batch.
    const seen = new Set(allocations.map((row) => row._id));
    for (const batch of batches.values())
      for (const row of await ctx.db
        .query("productionBatchAllocations")
        .withIndex("by_productionBatchId", (q) =>
          q.eq("productionBatchId", batch._id),
        )
        .collect())
        if (
          !seen.has(row._id) &&
          row.tenantId === tenantId &&
          row.deletedAt == null
        ) {
          seen.add(row._id);
          allocations.push(row);
        }

    return {
      eventIds,
      tasks,
      dependencies,
      batches: [...batches.values()],
      allocations,
    };
  },
});

/**
 * Completed batches finished at or after `since`, for the yield report,
 * read through the status and finish-time index.
 */
export const batchesSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }): Promise<Batch[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !rules(auth).kitchen) return [];
    const tenantId = auth.tenantId;
    return (
      // Finished batches by their finish time: the yield report counts
      // completed batches finished in its period, however early they were
      // planned.
      (
        await ctx.db
          .query("productionBatches")
          .withIndex("by_tenantId_and_status_and_completedAt", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("status", "completed")
              .gte("completedAt", since),
          )
          .collect()
      )
        .filter((row) => row.deletedAt == null)
        .map(withVariance)
    );
  },
});

const OPEN_BATCH = new Set(["planned", "in_progress"] as const);

/**
 * Every batch still to cook (planned or in progress), house or event, read
 * through the status index: what the kitchen display shows. An open batch
 * of an event that started days ago still shows, so it can be finished.
 */
export const openBatches = query({
  args: {},
  handler: async (ctx): Promise<Batch[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !rules(auth).kitchen) return [];
    const tenantId = auth.tenantId;
    const out: Batch[] = [];
    for (const status of OPEN_BATCH)
      for (const row of await ctx.db
        .query("productionBatches")
        .withIndex("by_tenantId_and_status_and_completedAt", (q) =>
          q.eq("tenantId", tenantId).eq("status", status),
        )
        .collect())
        if (row.deletedAt == null) out.push(withVariance(row));
    return out;
  },
});

/** Newest saved first, the order the tenant index pages. */
const newestFirst = (
  a: { _creationTime: number },
  b: { _creationTime: number },
) => b._creationTime - a._creationTime;

/**
 * Finished batches newest first: completed ones that still owe a shortfall
 * or were finished in the last day (the floor's "finished batches" card).
 * Both kinds are read through their indexes and sent in one finished page.
 */
export const finishedBatchesPage = query({
  args: { now: v.number(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { now }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !rules(auth).kitchen)
      return { page: [] as Batch[], isDone: true, continueCursor: "" };
    const tenantId = auth.tenantId;
    const rows = await ctx.db
      .query("productionBatches")
      .withIndex("by_tenantId_and_status_and_completedAt", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("status", "completed")
          .gt("completedAt", now - DAY),
      )
      .collect();
    for (const unresolved of [undefined, null])
      rows.push(
        ...(await ctx.db
          .query("productionBatches")
          .withIndex("by_tenant_status_shortfall", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("status", "completed")
              .eq("shortfallResolvedAt", unresolved)
              .gt("shortfallQuantity", 0),
          )
          .collect()),
      );
    const byId = new Map(
      rows.filter((row) => row.deletedAt == null).map((row) => [row._id, row]),
    );
    return {
      page: [...byId.values()].sort(newestFirst).map(withVariance),
      isDone: true,
      continueCursor: "",
    };
  },
});

/** Share states before release. */
const UNRELEASED = ["planned", "produced", "portioned"] as const;

/**
 * Batch shares newest first, each with its batch: shares not released, on
 * batches not cancelled (the floor's "batch shares" card). Read by state
 * and sent in one finished page.
 */
export const sharesPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const empty: Array<Doc<"productionBatchAllocations"> & { batch: Batch }> =
      [];
    if (!auth.tenantId || !rules(auth).kitchen)
      return { page: empty, isDone: true, continueCursor: "" };
    const tenantId = auth.tenantId;
    const rows: Doc<"productionBatchAllocations">[] = [];
    for (const status of UNRELEASED)
      rows.push(
        ...(await ctx.db
          .query("productionBatchAllocations")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect()),
      );
    const page = empty;
    for (const row of rows.sort(newestFirst)) {
      if (row.deletedAt != null || row.status === "released") continue;
      const batch = await ctx.db.get(row.productionBatchId);
      if (
        !batch ||
        batch.tenantId !== tenantId ||
        batch.deletedAt != null ||
        batch.status === "cancelled"
      )
        continue;
      page.push({ ...row, batch: withVariance(batch) });
    }
    return { page, isDone: true, continueCursor: "" };
  },
});
