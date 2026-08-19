// AUTHOR-OWNED search seam — not generated.
//
// Natural-language search across entities. Parses a free-form query for
// intent (entity kind, status, date window) and a residual text term, then
// fans out across the full-text search indexes that the Manifest projection
// already declares on searchable fields. Results are merged, ranked by the
// Convex search score, and returned as a single bounded list.
//
// Wall-clock is passed in as `now` (queries must not read Date.now()).
// Tenant scoping comes from the authenticated identity — no client-supplied
// tenantId is trusted.
import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  invoiceSearchLabel,
  invoiceStatusFilter,
  keepInvoiceForSearch,
  parseSearchQuery,
  shouldQueryInvoices,
  type ParsedSearchQuery,
} from "./lib/parseSearchQuery";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchHit {
  kind: string;
  id: string;
  label: string;
  hint: string;
  path: string;
  score: number;
}

interface SearchTarget {
  kind: string;
  table: string;
  index: string;
  field: string;
  hint: string;
  /** Build the route path for a hit. */
  path: (doc: any) => string;
  /** Human label for a hit. */
  label: (doc: any) => string;
}

const TEXT_TARGETS: SearchTarget[] = [
  {
    kind: "event",
    table: "events",
    index: "search_title",
    field: "title",
    hint: "Event",
    path: (d) => `/events/${d._id}`,
    label: (d) => String(d.title ?? "Untitled event"),
  },
  {
    kind: "client",
    table: "clients",
    index: "search_companyName",
    field: "companyName",
    hint: "Client",
    path: (d) => `/clients/${d._id}`,
    label: (d) =>
      d.clientType === "company"
        ? String(d.companyName ?? "Unnamed company")
        : [d.givenName, d.familyName].filter(Boolean).join(" ") ||
          "Unnamed client",
  },
  {
    kind: "client",
    table: "clients",
    index: "search_givenName",
    field: "givenName",
    hint: "Client",
    path: (d) => `/clients/${d._id}`,
    label: (d) =>
      [d.givenName, d.familyName].filter(Boolean).join(" ") || "Unnamed client",
  },
  {
    kind: "client",
    table: "clients",
    index: "search_familyName",
    field: "familyName",
    hint: "Client",
    path: (d) => `/clients/${d._id}`,
    label: (d) =>
      [d.givenName, d.familyName].filter(Boolean).join(" ") || "Unnamed client",
  },
  {
    kind: "vendor",
    table: "vendors",
    index: "search_name",
    field: "name",
    hint: "Vendor",
    path: () => `/inventory/contracts`,
    label: (d) => String(d.name ?? "Unnamed vendor"),
  },
  {
    kind: "dish",
    table: "dishes",
    index: "search_name",
    field: "name",
    hint: "Dish",
    path: (d) => `/kitchen/dishes/${d._id}`,
    label: (d) => String(d.name ?? "Unnamed dish"),
  },
  {
    kind: "menu",
    table: "menus",
    index: "search_name",
    field: "name",
    hint: "Menu",
    path: (d) => `/kitchen/menus/${d._id}`,
    label: (d) => String(d.name ?? "Unnamed menu"),
  },
  {
    // Recipes became Components; there is no `recipes` table. Querying a
    // nonexistent table throws server-side and killed every text search (#133).
    kind: "component",
    table: "components",
    index: "search_name",
    field: "name",
    hint: "Component",
    path: (d) => `/kitchen/components/${d._id}`,
    label: (d) => String(d.name ?? "Unnamed component"),
  },
  {
    kind: "ingredient",
    table: "ingredients",
    index: "search_name",
    field: "name",
    hint: "Ingredient",
    path: (d) => `/kitchen/ingredients/${d._id}`,
    label: (d) => String(d.name ?? "Unnamed ingredient"),
  },
  {
    kind: "proposal",
    table: "proposals",
    index: "search_title",
    field: "title",
    hint: "Proposal",
    path: () => `/clients/proposals`,
    label: (d) => String(d.title ?? "Untitled proposal"),
  },
  {
    kind: "contract",
    table: "contracts",
    index: "search_title",
    field: "title",
    hint: "Contract",
    path: (d) => `/clients/contracts/${d._id}/document`,
    label: (d) => String(d.title ?? "Untitled contract"),
  },
  {
    kind: "lead",
    table: "leads",
    index: "search_companyName",
    field: "companyName",
    hint: "Lead",
    path: () => `/clients/pipeline`,
    label: (d) =>
      d.leadType === "company"
        ? String(d.companyName ?? "Unnamed lead")
        : [d.givenName, d.familyName].filter(Boolean).join(" ") ||
          "Unnamed lead",
  },
  {
    kind: "person",
    table: "people",
    index: "search_givenName",
    field: "givenName",
    hint: "Staff",
    path: () => `/staff/roster`,
    label: (d) =>
      [d.givenName, d.familyName].filter(Boolean).join(" ") || "Unnamed staff",
  },
  {
    kind: "person",
    table: "people",
    index: "search_familyName",
    field: "familyName",
    hint: "Staff",
    path: () => `/staff/roster`,
    label: (d) =>
      [d.givenName, d.familyName].filter(Boolean).join(" ") || "Unnamed staff",
  },
];

export const searchAll = query({
  args: { query: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = requireTenant(auth);

    const parsed = parseSearchQuery(args.query, args.now);
    const hits: SearchHit[] = [];
    const seenIds = new Set<string>();

    const wantsText = parsed.term.length > 0;
    // If the caller named entity kinds, restrict text search to those; otherwise
    // search everything that has an index.
    const kindFilter = parsed.kinds.size > 0 ? parsed.kinds : null;

    const addHit = (target: SearchTarget, doc: any, score: number) => {
      if (doc.deletedAt != null) return;
      const key = `${target.kind}:${doc._id}`;
      if (seenIds.has(key)) {
        // Keep the highest score across fields (e.g. client name fields).
        const existing = hits.find(
          (h) => h.kind === target.kind && h.id === String(doc._id),
        );
        if (existing && score > existing.score) existing.score = score;
        return;
      }
      seenIds.add(key);
      hits.push({
        kind: target.kind,
        id: String(doc._id),
        label: target.label(doc),
        hint: target.hint,
        path: target.path(doc),
        score,
      });
    };

    if (wantsText) {
      const targets = TEXT_TARGETS.filter(
        (t) => !kindFilter || kindFilter.has(t.kind),
      );
      // Fan out across targets in parallel. Each search is tenant-scoped via
      // the index filterFields.
      const searches = targets.map(async (target) => {
        // Table/index/field are data-driven, so go through an untyped builder.
        const rows: any[] = await (ctx.db as any)
          .query(target.table)
          .withSearchIndex(target.index, (q: any) =>
            q.search(target.field, parsed.term).eq("tenantId", tenantId),
          )
          .take(6);
        for (const row of rows) {
          addHit(target, row, Number(row._score ?? 0));
        }
      });
      await Promise.all(searches);
    }

    // Structured invoice intent — invoices have no full-text index, so honor
    // status / age / "unpaid" intent and INV-* numbers via the tenant index.
    // Skip only when the caller named other kinds explicitly (invoice excluded).
    const invoiceAllowed = !kindFilter || kindFilter.has("invoice");
    if (invoiceAllowed && shouldQueryInvoices(parsed)) {
      const invoiceHits = await queryInvoices(ctx, tenantId, parsed, args.now);
      for (const h of invoiceHits) {
        const key = `invoice:${h.id}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        hits.push(h);
      }
    }

    // Structured event date intent — when the caller asked for a date window
    // (e.g. "events next week") but there is no text term, a pure search-index
    // query is not possible (search requires a non-empty query). Fall back to
    // the tenant index and filter by startsAt.
    if (
      parsed.kinds.has("event") &&
      !wantsText &&
      (parsed.startAfter !== null || parsed.startBefore !== null)
    ) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .filter((q) => q.eq(q.field("deletedAt"), null))
        .take(60);
      for (const ev of events) {
        const start = ev.startsAt;
        if (start == null) continue;
        if (parsed.startAfter !== null && start < parsed.startAfter) continue;
        if (parsed.startBefore !== null && start >= parsed.startBefore)
          continue;
        const key = `event:${ev._id}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        hits.push({
          kind: "event",
          id: String(ev._id),
          label: String(ev.title ?? "Untitled event"),
          hint: "Event",
          path: `/events/${ev._id}`,
          score: 0.1, // lower than text-matched relevance
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, 30);
  },
});

async function queryInvoices(
  ctx: QueryCtx,
  tenantId: string,
  parsed: ParsedSearchQuery,
  now: number,
): Promise<SearchHit[]> {
  const statuses = invoiceStatusFilter(parsed);

  const ageThreshold =
    parsed.agedOverDays !== null && parsed.invoiceNumbers.length === 0
      ? now - parsed.agedOverDays * DAY_MS
      : null;

  // Invoices have no invoiceNumber index. take(120) missed billed
  // INV-2026-QA1 and draft INV-8BJQS7 when they were not on the first page.
  // Do not .filter(deletedAt === null) before paginate: optional deletedAt
  // is undefined, not null, so every page emptied, scanned never moved, and
  // the query spun until timeout (QA 193: Searching… 8–9s then No matches).
  // Skip deleted rows in JS like addHit (`deletedAt != null`).
  const PAGE = 100;
  const MAX_PAGES = 25;
  const MAX_HITS = 15;
  const out: SearchHit[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES && out.length < MAX_HITS) {
    const page = await ctx.db
      .query("invoices")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .paginate({ numItems: PAGE, cursor });
    pages += 1;
    for (const inv of page.page) {
      if (inv.deletedAt != null) continue;
      // Null status filter includes paid (QA Gallery INV-2026-QA1 is billed).
      if (!keepInvoiceForSearch(inv, parsed, statuses)) continue;
      if (ageThreshold !== null) {
        const anchor = inv.dueDate ?? inv.issuedAt;
        if (anchor == null || anchor > ageThreshold) continue;
      }
      out.push({
        kind: "invoice",
        id: String(inv._id),
        label: invoiceSearchLabel(inv),
        hint: invoiceHint(inv, now),
        path: `/finance/invoices/${inv._id}`,
        score: parsed.invoiceNumbers.length > 0 ? 0.9 : 0.5,
      });
      if (out.length >= MAX_HITS) break;
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, MAX_HITS);
}

function invoiceHint(inv: any, now: number): string {
  const status = String(inv.status ?? "");
  if (status === "overdue" && inv.dueDate != null) {
    const days = Math.max(0, Math.floor((now - inv.dueDate) / DAY_MS));
    return `Overdue ${days}d`;
  }
  return status ? `Invoice · ${status}` : "Invoice";
}
