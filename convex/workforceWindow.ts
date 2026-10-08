// Staff screens read only the rows they show: shifts of a date window, the
// time sheet and request histories a page at a time, the staff and needs of
// the events on screen. The generated lists (listShift, listTimeRecord, ...)
// load the company's whole table, and on the live server those loads ran out
// of time.
//
// Each query keeps the read rule of its generated list and opens the same
// encrypted fields; a row the caller may not read is left out, as there.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { canRead } from "./search";

export const WINDOW_EVENT_CAP = 1000;
export const SHIFT_IDS_CAP = 1000;
/**
 * Time entries are made when the person clocks in (or later, by a manager or
 * an import), so an entry for a period is created inside it or after it. The
 * clock-in time comes from the phone, whose clock can be a little off.
 */
const CLOCK_IN_SLACK_MS = 3_600_000;

/** Same as the generated lists' field decryption. */
async function opened<T extends Record<string, unknown>>(
  ctx: QueryCtx,
  entity: string,
  fields: readonly string[],
  doc: T,
): Promise<T> {
  const out: Record<string, unknown> = { ...doc };
  for (const property of fields) {
    const raw = out[property];
    if (typeof raw !== "string") continue;
    let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null;
    try {
      envelope = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("v" in envelope && "kid" in envelope && "ct" in envelope)
    )
      continue;
    if (envelope.v !== 1)
      throw new Error(
        `Unsupported Manifest encryption envelope version: ${String(envelope.v)}`,
      );
    out[property] = await decrypt(String(envelope.ct), String(envelope.kid), {
      ctx,
      entity,
      property,
    });
  }
  return out as T;
}

const workforce = (auth: AppAuthContext) => canRead(auth, ["workforceAccess"]);
const self = (auth: AppAuthContext) =>
  canRead(auth, ["workforceSelfAccess"]) && auth.personId != null;
/** workforceManageAccess: admin, owner, system, workforce_manager. */
const managesWorkforce = (auth: AppAuthContext) =>
  ["admin", "owner", "system", "workforce_manager"].includes(auth.role) &&
  !orgCapabilityDeniesAction(
    "workforceManageAccess",
    auth.disabledCapabilities,
  );

// The generated read rules, row by row.
const readsShift = (auth: AppAuthContext, row: Doc<"shifts">) =>
  workforce(auth) ||
  (canRead(auth, ["workforceSelfAccess"]) &&
    ((auth.personId != null && row.personId === auth.personId) ||
      row.eventId != null));
const readsOwn = (auth: AppAuthContext, row: { personId?: string | null }) =>
  workforce(auth) || (self(auth) && row.personId === auth.personId);
const readsTimeOff = (auth: AppAuthContext, row: Doc<"timeOffRequests">) =>
  managesWorkforce(auth) ||
  (auth.id !== "" &&
    row.requesterAuthSubjectId != null &&
    row.requesterAuthSubjectId === auth.id) ||
  (auth.personId != null && row.personId === auth.personId);
const readsSwap = (auth: AppAuthContext, row: Doc<"shiftSwapRequests">) =>
  workforce(auth) ||
  (self(auth) &&
    (row.requesterPersonId === auth.personId ||
      row.recipientPersonId === auth.personId));

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };
/** Oldest saved first, the order the tenant index reads. */
const byCreation = (
  a: { _creationTime: number },
  b: { _creationTime: number },
) => a._creationTime - b._creationTime;

/**
 * Shifts that overlap [from, to) (no `to`: everything from `from` on): one
 * index read on end time. Shifts with no end time are left out; every screen
 * that reads this skips them too.
 */
export const shifts = query({
  args: { from: v.number(), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }): Promise<Doc<"shifts">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const rows = await ctx.db
      .query("shifts")
      .withIndex("by_tenantId_and_endsAt", (q) =>
        q.eq("tenantId", tenantId).gt("endsAt", from),
      )
      .collect();
    const out: Doc<"shifts">[] = [];
    for (const row of rows) {
      if (row.deletedAt != null) continue;
      if (to != null && !(row.startsAt != null && row.startsAt < to)) continue;
      const plain = await opened(ctx, "Shift", ["notes"], row);
      if (readsShift(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/** These shifts (at most SHIFT_IDS_CAP ids), for rows that name them. */
export const shiftsByIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<Doc<"shifts">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const out: Doc<"shifts">[] = [];
    for (const raw of [...new Set(ids)].slice(0, SHIFT_IDS_CAP)) {
      const id = ctx.db.normalizeId("shifts", raw);
      const row = id ? await ctx.db.get(id) : null;
      if (!row || row.tenantId !== auth.tenantId || row.deletedAt != null)
        continue;
      const plain = await opened(ctx, "Shift", ["notes"], row);
      if (readsShift(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/**
 * These shifts (at most SHIFT_IDS_CAP) and every shift that overlaps one of
 * them, for checking who could take a swapped shift.
 */
export const shiftsAround = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<Doc<"shifts">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const found = new Map<string, Doc<"shifts">>();
    for (const raw of [...new Set(ids)].slice(0, SHIFT_IDS_CAP)) {
      const id = ctx.db.normalizeId("shifts", raw);
      const shift = id ? await ctx.db.get(id) : null;
      if (!shift || shift.tenantId !== tenantId) continue;
      found.set(shift._id, shift);
      const { startsAt, endsAt } = shift;
      if (startsAt == null || endsAt == null) continue;
      for (const row of await ctx.db
        .query("shifts")
        .withIndex("by_tenantId_and_endsAt", (q) =>
          q.eq("tenantId", tenantId).gt("endsAt", startsAt),
        )
        .filter((q) => q.lt(q.field("startsAt"), endsAt))
        .collect())
        found.set(row._id, row);
    }
    const out: Doc<"shifts">[] = [];
    for (const row of found.values()) {
      if (row.deletedAt != null) continue;
      const plain = await opened(ctx, "Shift", ["notes"], row);
      if (readsShift(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/** These people's training completions. Same rule as listTrainingCompletion. */
export const trainingCompletionsFor = query({
  args: { personIds: v.array(v.string()) },
  handler: async (
    ctx,
    { personIds },
  ): Promise<Doc<"trainingCompletions">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !workforce(auth)) return [];
    const out: Doc<"trainingCompletions">[] = [];
    for (const raw of [...new Set(personIds)].slice(0, SHIFT_IDS_CAP)) {
      const personId = ctx.db.normalizeId("people", raw);
      if (!personId) continue;
      for (const row of await ctx.db
        .query("trainingCompletions")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .collect())
        if (row.tenantId === auth.tenantId && row.deletedAt == null)
          out.push(await opened(ctx, "TrainingCompletion", ["notes"], row));
    }
    return out;
  },
});

/**
 * Time entries wholly inside [from, to), read through the clock-in index.
 * Callers keep their own period rule, so totals match the whole list's.
 */
export const timeRecordsIn = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<Doc<"timeRecords">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const rows = (
      await ctx.db
        .query("timeRecords")
        .withIndex("by_tenantId_and_clockInAt", (q) =>
          q
            .eq("tenantId", tenantId)
            .gte("clockInAt", from)
            .lte("clockInAt", to),
        )
        .collect()
    ).sort(byCreation);
    const out: Doc<"timeRecords">[] = [];
    for (const row of rows) {
      if (row.deletedAt != null) continue;
      // Whole entry inside the period, the utilization and payroll rule.
      if (
        row.clockInAt == null ||
        row.clockOutAt == null ||
        row.clockInAt < from ||
        row.clockOutAt > to
      )
        continue;
      const plain = await opened(ctx, "TimeRecord", ["notes"], row);
      if (readsOwn(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/**
 * Approved time off that overlaps [from, to): approved rows that end after
 * `from`, through the state and end-date index. Same rule as
 * listTimeOffRequest.
 */
export const approvedTimeOff = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<Doc<"timeOffRequests">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const out: Doc<"timeOffRequests">[] = [];
    for (const row of (
      await ctx.db
        .query("timeOffRequests")
        .withIndex("by_tenantId_and_status_and_endsAt", (q) =>
          q
            .eq("tenantId", tenantId)
            .eq("status", "approved")
            .gt("endsAt", from),
        )
        .collect()
    ).sort(byCreation)) {
      if (row.deletedAt != null) continue;
      if (row.startsAt == null || row.endsAt == null) continue;
      if (!(row.startsAt < to && row.endsAt > from)) continue;
      const plain = await opened(
        ctx,
        "TimeOffRequest",
        ["reason", "responseNote"],
        row,
      );
      if (readsTimeOff(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/**
 * The newest `limit` approved and the newest `limit` denied requests (by
 * when they were made), for a "recently reviewed" list.
 */
export const reviewedTimeOff = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }): Promise<Doc<"timeOffRequests">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const out: Doc<"timeOffRequests">[] = [];
    for (const status of ["approved", "denied"] as const)
      for (const row of await ctx.db
        .query("timeOffRequests")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", status),
        )
        .order("desc")
        .filter((q) =>
          q.or(
            q.eq(q.field("deletedAt"), undefined),
            q.eq(q.field("deletedAt"), null),
          ),
        )
        .take(Math.min(limit, 200))) {
        const plain = await opened(
          ctx,
          "TimeOffRequest",
          ["reason", "responseNote"],
          row,
        );
        if (readsTimeOff(auth, plain)) out.push(plain);
      }
    return out;
  },
});

/** These people's schedule notices for one week. */
export const weekNotices = query({
  args: { personIds: v.array(v.string()), weekStartsAt: v.number() },
  handler: async (
    ctx,
    { personIds, weekStartsAt },
  ): Promise<Doc<"weeklyScheduleNotices">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const out: Doc<"weeklyScheduleNotices">[] = [];
    for (const raw of [...new Set(personIds)].slice(0, SHIFT_IDS_CAP)) {
      const personId = ctx.db.normalizeId("people", raw);
      if (!personId) continue;
      for (const row of await ctx.db
        .query("weeklyScheduleNotices")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .collect())
        if (
          row.tenantId === auth.tenantId &&
          row.deletedAt == null &&
          row.weekStartsAt === weekStartsAt &&
          readsOwn(auth, row)
        )
          out.push(row);
    }
    return out;
  },
});

/** One person's schedule notices for weeks that end at or after `from`. */
export const personScheduleNotices = query({
  args: { personId: v.id("people"), from: v.number() },
  handler: async (
    ctx,
    { personId, from },
  ): Promise<Doc<"weeklyScheduleNotices">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    return (
      await ctx.db
        .query("weeklyScheduleNotices")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .collect()
    ).filter(
      (row) =>
        row.tenantId === auth.tenantId &&
        row.deletedAt == null &&
        row.weekEndsAt >= from &&
        readsOwn(auth, row),
    );
  },
});

/** One person's active availability windows. */
export const personActiveWindows = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }): Promise<Doc<"availabilityWindows">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const out: Doc<"availabilityWindows">[] = [];
    for (const row of await ctx.db
      .query("availabilityWindows")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect()) {
      if (
        row.tenantId !== auth.tenantId ||
        row.deletedAt != null ||
        String(row.status) !== "active"
      )
        continue;
      const plain = await opened(ctx, "AvailabilityWindow", ["notes"], row);
      if (readsOwn(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/** One person's time entries that can fall in a period starting at `from`. */
export const personTimeRecordsSince = query({
  args: { personId: v.id("people"), from: v.number() },
  handler: async (ctx, { personId, from }): Promise<Doc<"timeRecords">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const rows = await ctx.db
      .query("timeRecords")
      .withIndex("by_personId", (q) =>
        q
          .eq("personId", personId)
          .gte("_creationTime", from - CLOCK_IN_SLACK_MS),
      )
      .collect();
    const out: Doc<"timeRecords">[] = [];
    for (const row of rows) {
      if (row.tenantId !== auth.tenantId || row.deletedAt != null) continue;
      const plain = await opened(ctx, "TimeRecord", ["notes"], row);
      if (readsOwn(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/**
 * One person's live shifts: every started one, and scheduled ones that end
 * at or after `from` or have no end yet. What My Day lists as coming work.
 */
export const personOpenShifts = query({
  args: { personId: v.id("people"), from: v.number() },
  handler: async (ctx, { personId, from }): Promise<Doc<"shifts">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const read = (
      status: "scheduled" | "started",
      ends: "from" | "any" | null | undefined,
    ) =>
      ctx.db
        .query("shifts")
        .withIndex("by_staff_status_end", (q) => {
          const base = q
            .eq("tenantId", tenantId)
            .eq("personId", personId)
            .eq("status", status);
          if (ends === "any") return base;
          if (ends === "from") return base.gte("endsAt", from);
          return base.eq("endsAt", ends);
        })
        .collect();
    const rows = [
      ...(await read("started", "any")),
      ...(await read("scheduled", "from")),
      ...(await read("scheduled", null)),
      ...(await read("scheduled", undefined)),
    ];
    const out: Doc<"shifts">[] = [];
    for (const row of rows) {
      if (row.deletedAt != null) continue;
      const plain = await opened(ctx, "Shift", ["notes"], row);
      if (readsShift(auth, plain)) out.push(plain);
    }
    return out;
  },
});

const OPEN_PREP = ["pending", "claimed", "in_progress", "blocked"] as const;

/**
 * My Day prep: open tasks due by `dueBy` that are this person's or unclaimed
 * at the events they work today; every task of those tasks' events (progress
 * per dish, "made so far"); and the prep links behind the open tasks with the
 * tasks they wait on. Same rule as listPrepTask / listPrepTaskDependency.
 */
export const myDayPrep = query({
  args: {
    personId: v.string(),
    eventIds: v.array(v.string()),
    dueBy: v.number(),
  },
  handler: async (ctx, { personId, eventIds, dueBy }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      tasks: [] as Doc<"prepTasks">[],
      links: [] as Doc<"prepTaskDependencies">[],
    };
    if (!auth.tenantId || !canRead(auth, ["kitchenAccess", "manageAccess"]))
      return out;
    const tenantId = auth.tenantId;
    const workEvents = new Set(eventIds);
    const open: Doc<"prepTasks">[] = [];
    for (const status of OPEN_PREP)
      for (const task of await ctx.db
        .query("prepTasks")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", status),
        )
        .collect())
        if (
          task.deletedAt == null &&
          (task.assignedToId === personId ||
            (task.assignedToId == null && workEvents.has(task.eventId))) &&
          (task.dueAt == null || task.dueAt <= dueBy)
        )
          open.push(task);
    const tasks = new Map<string, Doc<"prepTasks">>();
    for (const eventId of new Set(open.map((task) => task.eventId)))
      for (const task of await ctx.db
        .query("prepTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (task.tenantId === tenantId && task.deletedAt == null)
          tasks.set(task._id, task);
    // Links into the open tasks, and on up the chain (a loop is named).
    const seen = new Set<string>();
    const queue: Id<"prepTasks">[] = open.map((task) => task._id);
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const link of await ctx.db
        .query("prepTaskDependencies")
        .withIndex("by_dependentTaskId", (q) => q.eq("dependentTaskId", id))
        .collect()) {
        if (link.tenantId !== tenantId) continue;
        out.links.push(link);
        queue.push(link.predecessorTaskId);
        if (!tasks.has(link.predecessorTaskId)) {
          const before = await ctx.db.get(link.predecessorTaskId);
          if (
            before &&
            before.tenantId === tenantId &&
            before.deletedAt == null
          )
            tasks.set(before._id, before);
        }
      }
    }
    out.tasks = [...tasks.values()];
    return out;
  },
});

/**
 * Pack lists of these events and their lines (at most WINDOW_EVENT_CAP
 * events). Same rule and fields as listPackList / listPackListItem.
 */
export const packForEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      packLists: [] as Doc<"packLists">[],
      packLines: [] as Array<
        Doc<"packListItems"> & { surplusQuantity: number }
      >,
    };
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return out;
    for (const raw of [...new Set(eventIds)].slice(0, WINDOW_EVENT_CAP)) {
      const eventId = ctx.db.normalizeId("events", raw);
      if (!eventId) continue;
      for (const list of await ctx.db
        .query("packLists")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect()) {
        if (list.tenantId !== auth.tenantId || list.deletedAt != null) continue;
        out.packLists.push(await opened(ctx, "PackList", ["notes"], list));
        for (const line of await ctx.db
          .query("packListItems")
          .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
          .collect())
          if (line.tenantId === auth.tenantId && line.deletedAt == null)
            out.packLines.push({
              ...line,
              surplusQuantity: Math.max(
                0,
                Number(line.packedQuantity) - Number(line.requiredQuantity),
              ),
            });
      }
    }
    return out;
  },
});

/** Finalized closeouts My Day looks through for today's (newest made first). */
const RECENT_CLOSEOUTS = 200;

/**
 * Closeouts My Day shows: drafts, and ones finalized or captured since
 * `since`. Same rule as listEventCloseout.
 */
export const fieldCloseouts = query({
  args: { since: v.number() },
  handler: async (ctx, { since }): Promise<Doc<"eventCloseouts">[]> => {
    const auth = await getAuthContext(ctx);
    if (
      !auth.tenantId ||
      !canRead(auth, ["financeAccess", "eventManageAccess"])
    )
      return [];
    const tenantId = auth.tenantId;
    const byStatus = (status: "draft" | "finalized") =>
      ctx.db
        .query("eventCloseouts")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", status),
        );
    const drafts = await byStatus("draft").collect();
    const finalized = (
      await byStatus("finalized").order("desc").take(RECENT_CLOSEOUTS)
    ).filter((row) => (row.finalizedAt ?? row.capturedAt ?? 0) >= since);
    return [...drafts, ...finalized].filter((row) => row.deletedAt == null);
  },
});

/** A driver's deliveries My Day looks through for today's drops. */
const RECENT_DELIVERIES = 100;

/**
 * One driver's deliveries My Day shows: scheduled, on the road, or
 * delivered since `since`. Same rule as listDelivery.
 */
export const driverDeliveries = query({
  args: { driverId: v.id("people"), since: v.number() },
  handler: async (ctx, { driverId, since }): Promise<Doc<"deliveries">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["logisticsAccess", "manageAccess"]))
      return [];
    const tenantId = auth.tenantId;
    const rows: Doc<"deliveries">[] = [];
    for (const status of ["scheduled", "in_transit"] as const)
      rows.push(
        ...(await ctx.db
          .query("deliveries")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect()),
      );
    rows.push(
      ...(
        await ctx.db
          .query("deliveries")
          .withIndex("by_driverId", (q) => q.eq("driverId", driverId))
          .order("desc")
          .take(RECENT_DELIVERIES)
      ).filter(
        (row) =>
          String(row.status) === "delivered" && (row.deliveredAt ?? 0) >= since,
      ),
    );
    const out: Doc<"deliveries">[] = [];
    for (const row of rows) {
      if (
        row.tenantId !== tenantId ||
        row.deletedAt != null ||
        row.driverId !== driverId
      )
        continue;
      out.push(await opened(ctx, "Delivery", ["notes"], row));
    }
    return out;
  },
});

/** The time sheet, newest entries first, a page at a time. */
export const timeRecordPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("timeRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    const page: Doc<"timeRecords">[] = [];
    for (const row of result.page) {
      if (row.deletedAt != null) continue;
      const plain = await opened(ctx, "TimeRecord", ["notes"], row);
      if (readsOwn(auth, plain)) page.push(plain);
    }
    return { ...result, page };
  },
});

/** Declared availability windows, newest first, a page at a time. */
export const availabilityWindowPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("availabilityWindows")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    const page: Doc<"availabilityWindows">[] = [];
    for (const row of result.page) {
      if (row.deletedAt != null) continue;
      const plain = await opened(ctx, "AvailabilityWindow", ["notes"], row);
      if (readsOwn(auth, plain)) page.push(plain);
    }
    return { ...result, page };
  },
});

/**
 * Availability windows that overlap [from, to): windows that end after
 * `from`, through the end-date index.
 */
export const availabilityWindows = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }): Promise<Doc<"availabilityWindows">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const rows = (
      await ctx.db
        .query("availabilityWindows")
        .withIndex("by_tenantId_and_endsAt", (q) =>
          q.eq("tenantId", tenantId).gt("endsAt", from),
        )
        .collect()
    ).sort(byCreation);
    const out: Doc<"availabilityWindows">[] = [];
    for (const row of rows) {
      if (row.deletedAt != null) continue;
      if (row.startsAt == null || row.endsAt == null) continue;
      if (!(row.startsAt < to && row.endsAt > from)) continue;
      const plain = await opened(ctx, "AvailabilityWindow", ["notes"], row);
      if (readsOwn(auth, plain)) out.push(plain);
    }
    return out;
  },
});

/** Shift swap requests, newest first, a page at a time. */
export const swapRequestPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("shiftSwapRequests")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    const page: Doc<"shiftSwapRequests">[] = [];
    for (const row of result.page) {
      if (row.deletedAt != null) continue;
      const plain = await opened(
        ctx,
        "ShiftSwapRequest",
        ["reason", "reviewNote"],
        row,
      );
      if (readsSwap(auth, plain)) page.push(plain);
    }
    return { ...result, page };
  },
});

/**
 * Staff assignments and staffing needs of these events (at most
 * WINDOW_EVENT_CAP), read by event. Same rule as listEventAssignment and
 * listEventStaffNeed: workforce or workforce-self access, else none.
 */
export const forEvents = query({
  args: {
    eventIds: v.array(v.string()),
    /** Only this person's assignments. */
    personId: v.optional(v.string()),
  },
  handler: async (ctx, { eventIds, personId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      assignments: [] as Doc<"eventAssignments">[],
      staffNeeds: [] as Doc<"eventStaffNeeds">[],
    };
    if (
      !auth.tenantId ||
      !canRead(auth, ["workforceAccess", "workforceSelfAccess"])
    )
      return out;
    const ids: Id<"events">[] = [];
    for (const raw of [...new Set(eventIds)].slice(0, WINDOW_EVENT_CAP)) {
      const id = ctx.db.normalizeId("events", raw);
      if (id) ids.push(id);
    }
    const mine = <T extends { tenantId: string; deletedAt?: number | null }>(
      rows: T[],
    ) =>
      rows.filter(
        (row) => row.tenantId === auth.tenantId && row.deletedAt == null,
      );
    for (const eventId of ids) {
      for (const row of mine(
        await ctx.db
          .query("eventAssignments")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .collect(),
      ))
        if (personId == null || row.personId === personId)
          out.assignments.push(
            await opened(ctx, "EventAssignment", ["notes"], row),
          );
      out.staffNeeds.push(
        ...mine(
          await ctx.db
            .query("eventStaffNeeds")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
        ),
      );
    }
    return out;
  },
});
