// PL-SCALE (AC-172): the Events page reads one date-ordered window, not the
// tenant's whole event table. The generated listEvent loads every event with
// its menu tree, staffing, prep, pack lists and deliveries, so 10,000 events
// pass Convex's read limits. This read returns only the ledger's columns and
// stops at `limit` rows; "Show more" asks for a bigger window.
//
// Tabs:
// - upcoming: events from yesterday on (date index) + events with no date.
// - attention: quotes and events waiting for approval (any date), planning
//   events up to two weeks out, and events in the next two weeks with no
//   headcount. Old past events with no headcount are not listed (decision in
//   the PL-SCALE plan note).
// - all / one stage: date order through the date or stage+date index.
// Search: title and client-name hits across ALL events (search indexes); the
// page also matches title/venue/client inside the loaded window.
// Service style (#428): the style filter runs in the database read, so the
// window holds only that style and "Show more" reaches every event of it. The
// tab counts stay for all styles. `styles` lists every style the company has,
// so the filter can pick one that is not in the loaded window.
import { v } from "convex/values";
import type { FilterBuilder, NamedTableInfo } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const DAY = 86_400_000;
/** Most rows a tab count or a window reads; counts show "500+" past it. */
export const LEDGER_CAP = 500;
const SEARCH_TAKE = 100;
const DONE_STAGES = new Set(["completed", "cancelled", "closed_out"]);
const STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "cancelled",
  "closed_out",
] as const;
type Stage = (typeof STAGES)[number];

export interface LedgerRow {
  _id: Id<"events">;
  title: string;
  stage: Stage;
  eventType: string;
  startsAt: number | null;
  expectedHeadcount: number | null;
  venueName: string | null;
  clientId: Id<"clients"> | null;
  clientLabel: string;
  serviceStyleId: Id<"serviceStyles"> | null;
  serviceStyleName: string | null;
  serviceStyle: { name: string } | null;
  archivedAt: number | null;
}

export interface LedgerWindow {
  rows: LedgerRow[];
  /** Every service style of the company, for the style filter. */
  styles: { key: string; label: string }[];
  /** More rows exist past this window. */
  more: boolean;
  searchRows: LedgerRow[];
  upcomingCount: number;
  attentionCount: number;
  /** A count reached LEDGER_CAP and is a floor, not an exact number. */
  upcomingCapped: boolean;
  attentionCapped: boolean;
}

export function needsAction(
  e: Pick<Doc<"events">, "stage" | "startsAt" | "expectedHeadcount">,
  now: number,
): boolean {
  const stage = String(e.stage);
  if (stage === "pending_approval" || stage === "quote") return true;
  if (DONE_STAGES.has(stage)) return false;
  const soon = e.startsAt != null && e.startsAt - now < 14 * DAY;
  return soon && (stage === "planning" || !e.expectedHeadcount);
}

function clientLabel(client: Doc<"clients"> | null): string {
  if (!client) return "—";
  const companyName = client.companyName?.trim();
  if (client.clientType === "company" && companyName) return companyName;
  const name = [client.givenName, client.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || companyName || "—";
}

export const ledgerWindow = query({
  args: {
    view: v.string(),
    dir: v.union(v.literal("asc"), v.literal("desc")),
    limit: v.number(),
    showArchived: v.boolean(),
    /** Start of the caller's day; rounded so the read does not re-run every render. */
    now: v.number(),
    search: v.optional(v.string()),
    /** A service style id, or "none" for events with no style. */
    style: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<LedgerWindow | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const limit = Math.max(1, Math.min(Math.floor(args.limit), 2000));
    const now = args.now;
    const visible = (e: Doc<"events">) =>
      e.tenantId === tenantId &&
      e.deletedAt == null &&
      (args.showArchived || e.archivedAt == null);
    const style = args.style?.trim() || null;
    const ofStyle = (e: Doc<"events">) =>
      style == null ||
      (style === "none"
        ? e.serviceStyleId == null
        : String(e.serviceStyleId ?? "") === style);
    // The same style rule inside a database read.
    const styleWhere = (
      q: FilterBuilder<NamedTableInfo<DataModel, "events">>,
      styled: boolean,
    ) =>
      !styled || style == null
        ? true
        : style === "none"
          ? q.or(
              q.eq(q.field("serviceStyleId"), undefined),
              q.eq(q.field("serviceStyleId"), null),
            )
          : q.eq(q.field("serviceStyleId"), style as Id<"serviceStyles">);

    const byDate = (order: "asc" | "desc") =>
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId),
        )
        .order(order);
    // Upcoming reads skip deleted, archived and finished events in the
    // database read, so `take` counts only rows the tab shows.
    const fromYesterday = (order: "asc" | "desc", styled: boolean) =>
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).gte("startsAt", now - DAY),
        )
        .order(order)
        .filter((q) =>
          q.and(
            q.or(
              q.eq(q.field("deletedAt"), undefined),
              q.eq(q.field("deletedAt"), null),
            ),
            args.showArchived
              ? true
              : q.or(
                  q.eq(q.field("archivedAt"), undefined),
                  q.eq(q.field("archivedAt"), null),
                ),
            q.neq(q.field("stage"), "completed"),
            q.neq(q.field("stage"), "cancelled"),
            q.neq(q.field("stage"), "closed_out"),
            styleWhere(q, styled),
          ),
        );
    const undated = async (take: number, styled: boolean) => {
      const [none, missing] = await Promise.all(
        [null, undefined].map((startsAt) =>
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_startsAt", (q) =>
              q.eq("tenantId", tenantId).eq("startsAt", startsAt),
            )
            .filter((q) =>
              q.and(
                q.or(
                  q.eq(q.field("deletedAt"), undefined),
                  q.eq(q.field("deletedAt"), null),
                ),
                args.showArchived
                  ? true
                  : q.or(
                      q.eq(q.field("archivedAt"), undefined),
                      q.eq(q.field("archivedAt"), null),
                    ),
                q.neq(q.field("stage"), "completed"),
                q.neq(q.field("stage"), "cancelled"),
                q.neq(q.field("stage"), "closed_out"),
                styleWhere(q, styled),
              ),
            )
            .take(take),
        ),
      );
      return [...(missing ?? []), ...(none ?? [])];
    };
    const inStage = (stage: Stage, order: "asc" | "desc") =>
      ctx.db
        .query("events")
        .withIndex("by_tenantId_and_stage_and_startsAt", (q) =>
          q.eq("tenantId", tenantId).eq("stage", stage),
        )
        .order(order);

    // Upcoming window: from yesterday on, not done, plus undated.
    const upcomingOf = async (
      order: "asc" | "desc",
      take: number,
      styled: boolean,
    ) => {
      const [dated, noDate] = await Promise.all([
        fromYesterday(order, styled).take(take + 1),
        undated(take + 1, styled),
      ]);
      const keep = (e: Doc<"events">) =>
        visible(e) &&
        !DONE_STAGES.has(String(e.stage)) &&
        (!styled || ofStyle(e));
      const datedRows = dated.slice(0, take).filter(keep);
      const undatedRows = noDate.slice(0, take).filter(keep);
      return {
        datedRows,
        undatedRows,
        rows: [...datedRows, ...undatedRows],
        capped: dated.length > take || noDate.length > take,
      };
    };

    // Needs action: quote + pending approval (any date), planning up to two
    // weeks out, anything in the next two weeks with no headcount.
    const attentionOf = async (take: number) => {
      const twoWeeks = now + 14 * DAY;
      const [quotes, pending, planning, soon] = await Promise.all([
        inStage("quote", "asc").take(take + 1),
        inStage("pending_approval", "asc").take(take + 1),
        ctx.db
          .query("events")
          .withIndex("by_tenantId_and_stage_and_startsAt", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("stage", "planning")
              .gt("startsAt", null)
              .lt("startsAt", twoWeeks),
          )
          .order("desc")
          .take(take + 1),
        ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q
              .eq("tenantId", tenantId)
              .gte("startsAt", now - DAY)
              .lt("startsAt", twoWeeks),
          )
          .take(take + 1),
      ]);
      const seen = new Set<string>();
      const rows: Doc<"events">[] = [];
      for (const e of [...quotes, ...pending, ...planning, ...soon]) {
        if (seen.has(e._id) || !visible(e) || !needsAction(e, now)) continue;
        seen.add(e._id);
        rows.push(e);
      }
      return {
        rows,
        capped: [quotes, pending, planning, soon].some((l) => l.length > take),
      };
    };

    const [upcoming, attention] = await Promise.all([
      upcomingOf("asc", LEDGER_CAP, false),
      attentionOf(LEDGER_CAP),
    ]);

    let docs: Doc<"events">[];
    let more = false;
    if (args.view === "upcoming") {
      const w =
        args.dir === "asc" && limit <= LEDGER_CAP && style == null
          ? upcoming
          : await upcomingOf(args.dir, limit, true);
      // The window limit applies to dated rows; events with no date always
      // list (they sit under "Date to confirm").
      docs = [...w.datedRows.slice(0, limit), ...w.undatedRows];
      more = w.capped || w.datedRows.length > limit;
    } else if (args.view === "attention") {
      docs = attention.rows.filter(ofStyle);
      more = attention.capped;
    } else {
      const stage = (STAGES as readonly string[]).includes(args.view)
        ? (args.view as Stage)
        : null;
      const page = await (stage ? inStage(stage, args.dir) : byDate(args.dir))
        .filter((q) =>
          q.and(
            q.or(
              q.eq(q.field("deletedAt"), undefined),
              q.eq(q.field("deletedAt"), null),
            ),
            args.showArchived
              ? true
              : q.or(
                  q.eq(q.field("archivedAt"), undefined),
                  q.eq(q.field("archivedAt"), null),
                ),
            styleWhere(q, true),
          ),
        )
        .take(limit + 1);
      more = page.length > limit;
      docs = page.slice(0, limit).filter(visible);
    }

    // Client names follow the client read rule (sales or finance), as the
    // old page did by reading the client list.
    const seesClients = canRead(auth, ["salesAccess", "financeAccess"]);
    const searchDocs = await searchEvents(
      ctx,
      tenantId,
      args.search,
      seesClients,
    );

    const clients = new Map<string, Doc<"clients"> | null>();
    const styles = new Map<string, Doc<"serviceStyles"> | null>();
    const toRow = async (e: Doc<"events">): Promise<LedgerRow> => {
      let client: Doc<"clients"> | null = null;
      if (e.clientId && seesClients) {
        if (!clients.has(e.clientId)) {
          const found = await ctx.db.get(e.clientId);
          clients.set(
            e.clientId,
            found && found.tenantId === tenantId ? found : null,
          );
        }
        client = clients.get(e.clientId) ?? null;
      }
      let style: Doc<"serviceStyles"> | null = null;
      if (e.serviceStyleId) {
        if (!styles.has(e.serviceStyleId)) {
          const found = await ctx.db.get(e.serviceStyleId);
          styles.set(
            e.serviceStyleId,
            found && found.tenantId === tenantId ? found : null,
          );
        }
        style = styles.get(e.serviceStyleId) ?? null;
      }
      return {
        _id: e._id,
        title: e.title,
        stage: e.stage,
        eventType: e.eventType,
        startsAt: e.startsAt ?? null,
        expectedHeadcount: e.expectedHeadcount ?? null,
        venueName: e.venueName ?? null,
        clientId: e.clientId ?? null,
        clientLabel: clientLabel(client),
        serviceStyleId: e.serviceStyleId ?? null,
        serviceStyleName: e.serviceStyleName ?? null,
        serviceStyle: style ? { name: String(style.name ?? "") } : null,
        archivedAt: e.archivedAt ?? null,
      };
    };

    const rows: LedgerRow[] = [];
    for (const e of docs) rows.push(await toRow(e));
    const searchRows: LedgerRow[] = [];
    for (const e of searchDocs.filter(visible)) searchRows.push(await toRow(e));

    const styleDocs = await ctx.db
      .query("serviceStyles")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(200);
    const styleList = styleDocs
      .filter((s) => s.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((s) => ({ key: String(s._id), label: s.name }));

    return {
      rows,
      styles: styleList,
      more,
      searchRows,
      upcomingCount: upcoming.rows.length,
      attentionCount: attention.rows.length,
      upcomingCapped: upcoming.capped,
      attentionCapped: attention.capped,
    };
  },
});

/** Title and client-name hits across every event of the tenant. */
async function searchEvents(
  ctx: QueryCtx,
  tenantId: string,
  search: string | undefined,
  byClientName: boolean,
): Promise<Doc<"events">[]> {
  const term = (search ?? "").trim();
  if (term.length < 2) return [];
  const byTitle = await ctx.db
    .query("events")
    .withSearchIndex("search_title", (q) =>
      q.search("title", term).eq("tenantId", tenantId),
    )
    .take(SEARCH_TAKE);
  const clientIndexes = byClientName
    ? (["search_companyName", "search_givenName", "search_familyName"] as const)
    : [];
  const clientHits = await Promise.all(
    clientIndexes.map((index) => {
      const field =
        index === "search_companyName"
          ? "companyName"
          : index === "search_givenName"
            ? "givenName"
            : "familyName";
      return ctx.db
        .query("clients")
        .withSearchIndex(index, (q) =>
          q.search(field, term).eq("tenantId", tenantId),
        )
        .take(10);
    }),
  );
  const clientIds = new Set(clientHits.flat().map((c) => c._id));
  const byClient = (
    await Promise.all(
      [...clientIds].map((clientId) =>
        ctx.db
          .query("events")
          .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
          .take(20),
      ),
    )
  ).flat();
  const seen = new Set<string>();
  const out: Doc<"events">[] = [];
  for (const e of [...byTitle, ...byClient]) {
    if (e.tenantId !== tenantId || seen.has(e._id)) continue;
    seen.add(e._id);
    out.push(e);
  }
  return out;
}
