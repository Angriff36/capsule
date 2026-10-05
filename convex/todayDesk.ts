// PL-SCALE (AC-172): the Today page reads what it shows, not the company's
// whole event, invoice, prep, pack list and closeout tables. It returns the
// same row shapes HomeAttentionPolicy (src/features/home/) already takes:
// events from the start of the caller's day through the next eight days, the
// next few after that and a few with no date; open rows of each attention
// lane through the status indexes. Each lane follows its generated read
// rule, as the old page did by reading the generated lists.
import type { FilterBuilder, NamedTableInfo } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const DAY = 86_400_000;
/** Most open rows a lane counts; the page shows "500+" past it. */
export const LANE_CAP = 500;
/** A busy week for a large caterer is a few hundred events. */
const WINDOW_CAP = 2000;
/** The page lists eight upcoming services. */
const LATER_TAKE = 8;

const OPEN_INVOICE = ["draft", "sent", "viewed", "overdue", "partial"];
const OPEN_PREP = ["pending", "claimed", "in_progress", "blocked"];
const OPEN_PACK = ["draft", "packing", "packed", "loaded"];
const DRAFT_CLOSEOUT = ["draft"];

export interface DeskEvent {
  _id: string;
  title: string;
  stage: string;
  startsAt: number | null;
  deletedAt: null;
}

export interface TodayDesk {
  events: DeskEvent[];
  invoices: { status: string; deletedAt: null }[];
  prepTasks: { status: string; deletedAt: null }[];
  packLists: OpenRow[];
  closeouts: { status: string; deletedAt: null }[];
  /** Lanes whose count reached LANE_CAP and is a floor. */
  capped: string[];
}

type StatusTable = "invoices" | "prepTasks" | "packLists" | "eventCloseouts";

interface OpenRow {
  status: string;
  eventId: string | null;
  deletedAt: null;
}

async function openRows(
  ctx: QueryCtx,
  table: StatusTable,
  tenantId: string,
  statuses: readonly string[],
): Promise<{ rows: OpenRow[]; capped: boolean }> {
  const lists = await Promise.all(
    statuses.map((status) =>
      ctx.db
        // The four tables share tenantId, status, deletedAt and the
        // by_tenantId_and_status index; only those fields are read.
        .query(table as "packLists")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", status as never),
        )
        .filter((q) =>
          q.or(
            q.eq(q.field("deletedAt"), undefined),
            q.eq(q.field("deletedAt"), null),
          ),
        )
        .take(LANE_CAP + 1),
    ),
  );
  const all = lists.flat();
  return {
    rows: all.slice(0, LANE_CAP).map((r: Doc<"packLists">) => ({
      status: String(r.status),
      eventId: r.eventId ?? null,
      deletedAt: null,
    })),
    capped: all.length > LANE_CAP,
  };
}

export const desk = query({
  args: {
    /** Start of the caller's local day. */
    startOfToday: v.number(),
  },
  handler: async (ctx, { startOfToday }): Promise<TodayDesk | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const windowEnd = startOfToday + 8 * DAY;

    const live = (q: FilterBuilder<NamedTableInfo<DataModel, "events">>) =>
      q.and(
        q.or(
          q.eq(q.field("deletedAt"), undefined),
          q.eq(q.field("deletedAt"), null),
        ),
        q.neq(q.field("stage"), "cancelled"),
        q.neq(q.field("stage"), "closed_out"),
      );
    const [inWindow, later, none, missing] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q
            .eq("tenantId", tenantId)
            .gte("startsAt", startOfToday)
            .lt("startsAt", windowEnd),
        )
        .filter(live)
        .take(WINDOW_CAP),
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).gte("startsAt", windowEnd),
        )
        .filter(live)
        .take(LATER_TAKE),
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("startsAt", null),
        )
        .filter(live)
        .take(LATER_TAKE),
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("startsAt", undefined),
        )
        .filter(live)
        .take(LATER_TAKE),
    ]);
    const events: DeskEvent[] = [
      ...inWindow,
      ...later,
      ...none,
      ...missing,
    ].map((e) => ({
      _id: e._id,
      title: e.title,
      stage: String(e.stage),
      startsAt: e.startsAt ?? null,
      deletedAt: null,
    }));

    const none$ = Promise.resolve({ rows: [] as OpenRow[], capped: false });
    const [invoices, prepTasks, packLists, closeouts] = await Promise.all([
      canRead(auth, ["financeAccess", "manageAccess"])
        ? openRows(ctx, "invoices", tenantId, OPEN_INVOICE)
        : none$,
      canRead(auth, ["kitchenAccess", "manageAccess"])
        ? openRows(ctx, "prepTasks", tenantId, OPEN_PREP)
        : none$,
      openRows(ctx, "packLists", tenantId, OPEN_PACK),
      canRead(auth, ["financeAccess", "eventManageAccess"])
        ? openRows(ctx, "eventCloseouts", tenantId, DRAFT_CLOSEOUT)
        : none$,
    ]);
    const capped = [
      invoices.capped && "open_invoices",
      prepTasks.capped && "open_prep",
      packLists.capped && "open_packs",
      closeouts.capped && "draft_closeouts",
    ].filter((id): id is string => typeof id === "string");

    const statusOnly = (rows: OpenRow[]) =>
      rows.map((r) => ({ status: r.status, deletedAt: null }));
    return {
      events,
      invoices: statusOnly(invoices.rows),
      prepTasks: statusOnly(prepTasks.rows),
      packLists: packLists.rows,
      closeouts: statusOnly(closeouts.rows),
      capped,
    };
  },
});
