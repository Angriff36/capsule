/**
 * AUTHOR SEAM — the parts of the imported-record links each screen needs.
 *
 * The generated listExternalRecordLink returns every link of the company in
 * one list. After the archive imports there were 9,385 links, and a list
 * from the server can hold at most 8,192 items, so /admin/reconcile, the
 * parallel-run dashboard and finance reconciliation failed to load
 * (2026-10-02). Each read here returns only the rows its screen works with.
 * Access is the same as the generated read: importAccess.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { sourceSummary } from "./lib/importResolution";
import { canRead } from "./search";

/** How many rows a list screen asks for at a time. */
export const LIST_PAGE = 50;
/** Stop counting once the exact number stops mattering. */
const COUNT_CAP = 500;

type Link = Doc<"externalRecordLinks">;

const SOURCE_SYSTEMS = new Set<Link["sourceSystem"]>([
  "tpp_legacy",
  "csv_export",
  "api_sync",
  "quickbooks_online",
  "google_calendar",
  "stripe",
  "nowsta",
  "other",
]);

function sourceOf(value: string | undefined): Link["sourceSystem"] | null {
  if (!value) return null;
  return SOURCE_SYSTEMS.has(value as Link["sourceSystem"])
    ? (value as Link["sourceSystem"])
    : null;
}

async function tenantOf(ctx: QueryCtx): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !canRead(auth, ["importAccess"])) return null;
  return auth.tenantId;
}

/** Live links of one record type, read through its index. */
async function ofRecordType(
  ctx: QueryCtx,
  tenantId: string,
  recordType: string,
): Promise<Link[]> {
  const rows: Link[] = [];
  for await (const row of ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_recordType", (q) =>
      q.eq("tenantId", tenantId).eq("recordType", recordType),
    ))
    if (row.deletedAt == null) rows.push(row);
  return rows;
}

/**
 * Links of the given record types (for example payment, invoice, menu), or
 * the ones still waiting for a person (conflictStatus pending_conflict), or
 * links to one kind of Capsule record. Filters combine with "or".
 */
export const listFor = query({
  args: {
    recordTypes: v.optional(v.array(v.string())),
    pending: v.optional(v.boolean()),
    capsuleEntities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Only the asked-for kinds are read, each through its own index. Reading
    // every link of the company timed out /admin/reconcile (2026-10-06).
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return [];
    const found = new Map<string, Link>();
    const keep = (row: Link) => {
      if (row.deletedAt == null) found.set(String(row._id), row);
    };
    for (const recordType of new Set(args.recordTypes ?? []))
      for (const row of await ofRecordType(ctx, tenantId, recordType))
        keep(row);
    for (const entity of new Set(args.capsuleEntities ?? []))
      for await (const row of ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_capsuleEntity", (q) =>
          q
            .eq("tenantId", tenantId)
            .eq("capsuleEntity", entity as Link["capsuleEntity"]),
        ))
        keep(row);
    if (args.pending === true)
      for await (const row of ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_conflictStatus", (q) =>
          q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
        ))
        keep(row);
    return [...found.values()];
  },
});

function parsedRaw(raw: string | null | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Columns the match list shows. The old spreadsheet text stays on the server. */
function queueRow(row: Link) {
  const summary = sourceSummary(row.rawSourceData);
  return {
    _id: row._id,
    sourceSystem: row.sourceSystem,
    recordType: row.recordType,
    externalId: row.externalId,
    capsuleEntity: row.capsuleEntity,
    capsuleId: row.capsuleId,
    conflictStatus: row.conflictStatus,
    resolutionNote: row.resolutionNote ?? null,
    createdAt: row.createdAt ?? null,
    deletedAt: row.deletedAt ?? null,
    verified: row.verified,
    sourceName: summary.name,
    sourceDetail: summary.detail,
  };
}

function pendingIndex(
  ctx: QueryCtx,
  tenantId: string,
  source: Link["sourceSystem"] | null,
) {
  // Waiting links are few, so the source system is a filter, not an index.
  if (source) {
    return ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_conflictStatus", (q) =>
        q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
      )
      .filter((q) => q.eq(q.field("sourceSystem"), source));
  }
  return ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_conflictStatus", (q) =>
      q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
    );
}

/**
 * One page of imported rows still waiting. A source-system choice is part of
 * the lookup, so the page is a full page of that system.
 */
export const queuePage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sourceSystem: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await pendingIndex(
      ctx,
      tenantId,
      sourceOf(args.sourceSystem),
    ).paginate(args.paginationOpts);
    return {
      page: result.page.filter((row) => row.deletedAt == null).map(queueRow),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** How many rows are still waiting, stopping at 500. */
export const waitingCount = query({
  args: { sourceSystem: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return { count: 0, more: false };
    let count = 0;
    for await (const row of pendingIndex(
      ctx,
      tenantId,
      sourceOf(args.sourceSystem),
    )) {
      if (row.deletedAt != null) continue;
      count += 1;
      if (count > COUNT_CAP) return { count: COUNT_CAP, more: true };
    }
    return { count, more: false };
  },
});

/**
 * Payment links for the money check, one page at a time, without the
 * spreadsheet text. The amounts the check needs are copied onto the row.
 */
export const paymentMoneyPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", "payment"),
      )
      .paginate(args.paginationOpts);
    return {
      page: result.page
        .filter((row) => row.deletedAt == null)
        .map((row) => {
          const facts = parsedRaw(row.rawSourceData);
          return {
            _id: row._id,
            _creationTime: row._creationTime,
            createdAt: row.createdAt ?? null,
            recordType: row.recordType,
            externalId: row.externalId,
            capsuleId: row.capsuleId,
            conflictStatus: row.conflictStatus,
            resolutionNote: row.resolutionNote ?? null,
            deletedAt: null,
            recordedAt: num(facts.recordedAt),
            amount: num(facts.amount),
            currency: text(facts.currency) ?? text(facts.currencyCode),
            rowClass: text(facts.rowClass),
            movesMoney: facts.movesMoney === true,
          };
        }),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Old money kept only for the record. Stops at 500. */
export const referenceOnlyCount = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return { count: 0, more: false };
    let count = 0;
    for await (const row of ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", "payment"),
      )) {
      if (row.deletedAt != null) continue;
      if (row.conflictStatus !== "resolved" || row.capsuleId !== "") continue;
      if (parsedRaw(row.rawSourceData).rowClass === undefined) continue;
      count += 1;
      if (count > COUNT_CAP) return { count: COUNT_CAP, more: true };
    }
    return { count, more: false };
  },
});

/**
 * The first 50 imported events still to match, plus a count that stops at 500.
 * The parallel-run page shows that page. It does not load every event link.
 */
export const unresolvedEvents = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return { rows: [], count: 0, more: false };
    const rows: ReturnType<typeof queueRow>[] = [];
    let count = 0;
    for await (const row of ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_conflictStatus", (q) =>
        q.eq("tenantId", tenantId).eq("conflictStatus", "pending_conflict"),
      )) {
      if (row.deletedAt != null) continue;
      if (
        row.capsuleEntity !== "event_record" ||
        row.sourceSystem !== "tpp_legacy" ||
        row.verified !== false
      )
        continue;
      count += 1;
      if (rows.length < LIST_PAGE) rows.push(queueRow(row));
      if (count > COUNT_CAP) return { rows, count: COUNT_CAP, more: true };
    }
    return { rows, count, more: false };
  },
});

/**
 * Names for the change-review list. One read per row on that list. The
 * spreadsheet text stays on the server; only the name comes back.
 */
export const sourceNames = query({
  args: { linkIds: v.array(v.id("externalRecordLinks")) },
  handler: async (ctx, args) => {
    const tenantId = await tenantOf(ctx);
    const names: Record<string, { name: string; recordType: string }> = {};
    if (tenantId == null) return names;
    for (const id of args.linkIds.slice(0, LIST_PAGE)) {
      const row = await ctx.db.get(id);
      if (!row || row.tenantId !== tenantId || row.deletedAt != null) continue;
      const summary = sourceSummary(row.rawSourceData);
      names[id] = {
        name: summary.name || row.externalId,
        recordType: row.recordType,
      };
    }
    return names;
  },
});

/**
 * The parallel-run menu check, counted on the server. The screen gets the
 * numbers only, not the dish catalog and not the menu links.
 */
export const menuLinkStats = query({
  args: {},
  handler: async (ctx) => {
    const tenantId = await tenantOf(ctx);
    if (tenantId == null) return null;
    const dishIds = new Set<string>();
    for await (const dish of ctx.db
      .query("dishes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId)))
      if (dish.deletedAt == null) dishIds.add(String(dish._id));
    let tppTotal = 0;
    let unresolvedLinks = 0;
    const linked = new Set<string>();
    for await (const link of ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", "menu"),
      )) {
      if (link.deletedAt != null) continue;
      if (link.sourceSystem !== "tpp_legacy") continue;
      if (link.conflictStatus === "superseded") continue;
      tppTotal += 1;
      const id = String(link.capsuleId ?? "");
      if (!id || !dishIds.has(id)) unresolvedLinks += 1;
      else linked.add(id);
    }
    return {
      tppTotal,
      unresolvedLinks,
      capsuleTotal: dishIds.size,
      dishesWithoutLink: dishIds.size - linked.size,
    };
  },
});
