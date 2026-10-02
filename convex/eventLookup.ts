// PL-SCALE (AC-172): screens that only need an event's name, date or stage
// for rows they already hold (prep tasks, pack lists, deliveries, shifts,
// closeouts...) read those events by id here, not the generated listEvent,
// which loads every event of the company with its whole menu tree. One point
// read per id; at most LOOKUP_CAP ids per call. Deleted events are returned
// with deletedAt so callers can say "removed" as before. Date-window screens
// and pickers use `range`, one index read on start time.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

export const LOOKUP_CAP = 1000;

export type EventLookupRow = Pick<
  Doc<"events">,
  | "_id"
  | "title"
  | "stage"
  | "eventType"
  | "startsAt"
  | "endsAt"
  | "venueId"
  | "venueName"
  | "clientId"
  | "expectedHeadcount"
  | "serviceStyleId"
  | "occasionId"
  | "eventNumber"
  | "deletedAt"
  // Same readers as the generated listEvent already see these.
  | "quotedPrice"
  | "assignedToId"
  | "referralSourceId"
  | "serviceStyleName"
  | "budgetAmount"
  | "createdAt"
  | "updatedAt"
>;

export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<EventLookupRow[] | null> => {
    const auth = await getAuthContext(ctx);
    // Same read rule as the generated listEvent.
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const wanted = [...new Set(ids)].slice(0, LOOKUP_CAP);
    const rows: EventLookupRow[] = [];
    for (const raw of wanted) {
      const id = ctx.db.normalizeId("events", raw);
      if (!id) continue;
      const e = await ctx.db.get(id);
      if (!e || e.tenantId !== tenantId) continue;
      rows.push(lookupRow(e));
    }
    return rows;
  },
});

/** A busy year for a large caterer is a few thousand events. */
export const RANGE_CAP = 3000;
const UNDATED_CAP = 300;

/**
 * Live events that start in [from, to), oldest first, at most RANGE_CAP
 * (`capped` says more exist). Screens that show a date window (dispatch,
 * kitchen, tracker, capacity, date-bound reports) and event pickers read
 * this instead of every event. `withUndated` adds events with no date yet
 * (new inquiries) so pickers can still choose them.
 */
export const range = query({
  args: {
    from: v.number(),
    to: v.number(),
    withUndated: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ rows: EventLookupRow[]; capped: boolean } | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const { docs, capped } = await readRange(ctx, auth.tenantId, args);
    return { rows: docs.map(lookupRow), capped };
  },
});

/**
 * The same window as `range`, but whole event records (less the import
 * draft and the encrypted contact fields, which these screens never show),
 * for screens that read planning fields: tracker, planning checks, capacity.
 */
export const rangeDocs = query({
  args: {
    from: v.number(),
    to: v.number(),
    withUndated: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ rows: Doc<"events">[]; capped: boolean } | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const { docs, capped } = await readRange(ctx, auth.tenantId, args);
    return {
      rows: docs.map((e) => ({
        ...e,
        importDraftJson: null,
        primaryContactName: null,
        primaryContactEmail: null,
        primaryContactPhone: null,
      })),
      capped,
    };
  },
});

export const CLIENT_CAP = 2000;

/** One client's live events (light rows), at most CLIENT_CAP. */
export const byClient = query({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }): Promise<EventLookupRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const id = ctx.db.normalizeId("clients", clientId);
    if (!id) return [];
    const rows = await ctx.db
      .query("events")
      .withIndex("by_clientId", (q) => q.eq("clientId", id))
      .take(CLIENT_CAP);
    return rows
      .filter((e) => e.tenantId === auth.tenantId && e.deletedAt == null)
      .map(lookupRow);
  },
});

async function readRange(
  ctx: QueryCtx,
  tenantId: string,
  {
    from,
    to,
    withUndated,
  }: { from: number; to: number; withUndated?: boolean },
): Promise<{ docs: Doc<"events">[]; capped: boolean }> {
  const [dated, none, missing] = await Promise.all([
    ctx.db
      .query("events")
      .withIndex("by_tenantId_and_startsAt", (q) =>
        q.eq("tenantId", tenantId).gte("startsAt", from).lt("startsAt", to),
      )
      .take(RANGE_CAP + 1),
    withUndated
      ? ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q.eq("tenantId", tenantId).eq("startsAt", null),
          )
          .take(UNDATED_CAP)
      : Promise.resolve([]),
    withUndated
      ? ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q.eq("tenantId", tenantId).eq("startsAt", undefined),
          )
          .take(UNDATED_CAP)
      : Promise.resolve([]),
  ]);
  const docs = [...dated.slice(0, RANGE_CAP), ...none, ...missing].filter(
    (e) => e.deletedAt == null,
  );
  return { docs, capped: dated.length > RANGE_CAP };
}

/**
 * Every event of the company in pages (deleted ones too, with deletedAt), in
 * light rows. All-time reports (client
 * lifetime value, sales by owner, average event value) page through this
 * instead of the generated listEvent; each call reads one page only.
 */
export const reportPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(lookupRow),
    };
  },
});

function lookupRow(e: Doc<"events">): EventLookupRow {
  return {
    _id: e._id,
    title: e.title,
    stage: e.stage,
    eventType: e.eventType,
    startsAt: e.startsAt ?? null,
    endsAt: e.endsAt ?? null,
    venueId: e.venueId ?? null,
    venueName: e.venueName ?? null,
    clientId: e.clientId ?? null,
    expectedHeadcount: e.expectedHeadcount ?? null,
    serviceStyleId: e.serviceStyleId ?? null,
    occasionId: e.occasionId ?? null,
    eventNumber: e.eventNumber ?? null,
    deletedAt: e.deletedAt ?? null,
    quotedPrice: e.quotedPrice ?? null,
    assignedToId: e.assignedToId ?? null,
    referralSourceId: e.referralSourceId ?? null,
    serviceStyleName: e.serviceStyleName ?? null,
    budgetAmount: e.budgetAmount ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
