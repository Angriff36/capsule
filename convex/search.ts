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

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchHit {
  kind: string;
  id: string;
  label: string;
  hint: string;
  path: string;
  score: number;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "show",
  "find",
  "me",
  "all",
  "list",
  "please",
  "my",
  "our",
]);

// Singular/plural entity keywords → internal kind. Order matters only for
// readability; matching is set-based.
const ENTITY_KEYWORDS: Record<string, string[]> = {
  event: ["event", "events", "booking", "bookings"],
  invoice: ["invoice", "invoices", "bill", "bills", "billing"],
  client: ["client", "clients", "customer", "customers", "account", "accounts"],
  vendor: ["vendor", "vendors", "supplier", "suppliers"],
  dish: ["dish", "dishes"],
  menu: ["menu", "menus"],
  component: ["recipe", "recipes", "component", "components"],
  ingredient: ["ingredient", "ingredients"],
  lead: ["lead", "leads"],
  proposal: ["proposal", "proposals", "quote", "quotes"],
  contract: ["contract", "contracts"],
  venue: ["venue", "venues"],
  person: ["staff", "person", "people", "employee", "employees", "crew"],
};

const STATUS_KEYWORDS: Record<string, string[]> = {
  unpaid: ["unpaid", "outstanding", "open", "owing", "due"],
  overdue: ["overdue", "late"],
  draft: ["draft"],
  sent: ["sent"],
  paid: ["paid", "settled"],
  cancelled: ["cancelled", "canceled"],
  approved: ["approved", "confirmed"],
  upcoming: ["upcoming", "future", "scheduled"],
};

interface ParsedQuery {
  term: string;
  kinds: Set<string>;
  statuses: Set<string>;
  /** Inclusive lower / exclusive upper bounds on a date (ms). null = unbounded. */
  startAfter: number | null;
  startBefore: number | null;
  /** Age threshold in days for "aged over N days" invoice intent. */
  agedOverDays: number | null;
}

function parseQuery(raw: string, now: number): ParsedQuery {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kinds = new Set<string>();
  const statuses = new Set<string>();
  const termTokens: string[] = [];
  let startAfter: number | null = null;
  let startBefore: number | null = null;
  let agedOverDays: number | null = null;

  const applyWeek = () => {
    const start = startOfDay(now);
    startAfter = start;
    startBefore = start + 7 * DAY_MS;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Multi-token date / age phrases first so the trailing tokens are consumed.
    if ((t === "next" || t === "this") && tokens[i + 1] === "week") {
      applyWeek();
      i++;
      continue;
    }
    if (t === "today") {
      const start = startOfDay(now);
      startAfter = start;
      startBefore = start + DAY_MS;
      continue;
    }
    if (
      (t === "over" || t === "older" || t === "past") &&
      /^\d+$/.test(tokens[i + 1] ?? "") &&
      (tokens[i + 2] ?? "").startsWith("day")
    ) {
      agedOverDays = Number(tokens[i + 1]);
      i += 2;
      continue;
    }

    // Single-token intent words.
    let consumed = false;
    for (const [kind, words] of Object.entries(ENTITY_KEYWORDS)) {
      if (words.includes(t)) {
        kinds.add(kind);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (const [status, words] of Object.entries(STATUS_KEYWORDS)) {
      if (words.includes(t)) {
        statuses.add(status);
        if (status === "overdue") agedOverDays = agedOverDays ?? 0;
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    if (!STOP_WORDS.has(t)) termTokens.push(t);
  }

  return {
    term: termTokens.join(" ").trim(),
    kinds,
    statuses,
    startAfter,
    startBefore,
    agedOverDays,
  };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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

    const parsed = parseQuery(args.query, args.now);
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
    // status / age / "unpaid" intent via the tenant index and in-query filter.
    // Skip only when the caller named other kinds explicitly (invoice excluded).
    const invoiceAllowed = !kindFilter || kindFilter.has("invoice");
    if (invoiceAllowed && shouldQueryInvoices(parsed)) {
      const invoiceHits = await queryInvoices(
        ctx,
        tenantId,
        parsed,
        args.now,
        wantsText ? parsed.term : null,
      );
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

function shouldQueryInvoices(parsed: ParsedQuery): boolean {
  // Query invoices when there is explicit invoice/status/age intent, or when
  // there is no text term at all (browse-style).
  if (parsed.statuses.size > 0) return true;
  if (parsed.agedOverDays !== null) return true;
  if (parsed.kinds.has("invoice")) return true;
  return false;
}

async function queryInvoices(
  ctx: QueryCtx,
  tenantId: string,
  parsed: ParsedQuery,
  now: number,
  textTerm: string | null,
): Promise<SearchHit[]> {
  const unpaidStatuses = new Set([
    "sent",
    "viewed",
    "overdue",
    "partial",
    "draft",
  ]);
  const statuses = new Set<string>();
  for (const s of parsed.statuses) {
    if (s === "unpaid") unpaidStatuses.forEach((x) => statuses.add(x));
    else if (s === "overdue") statuses.add("overdue");
    else if (s === "paid") statuses.add("paid");
    else if (s === "draft") statuses.add("draft");
    else if (s === "sent") statuses.add("sent");
  }
  // Default: when invoice intent is present without a status, treat as unpaid.
  if (
    statuses.size === 0 &&
    (parsed.kinds.has("invoice") || parsed.agedOverDays !== null)
  ) {
    unpaidStatuses.forEach((x) => statuses.add(x));
  }

  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .filter((q) => q.eq(q.field("deletedAt"), null))
    .take(120);

  const ageThreshold =
    parsed.agedOverDays !== null ? now - parsed.agedOverDays * DAY_MS : null;

  const out: SearchHit[] = [];
  for (const inv of rows) {
    if (statuses.size > 0 && !statuses.has(String(inv.status))) continue;
    if (textTerm) {
      const num = String(inv.invoiceNumber ?? "").toLowerCase();
      if (!num.includes(textTerm.toLowerCase())) continue;
    }
    if (ageThreshold !== null) {
      const anchor = inv.dueDate ?? inv.issuedAt;
      if (anchor == null || anchor > ageThreshold) continue;
    }
    out.push({
      kind: "invoice",
      id: String(inv._id),
      label: invoiceLabel(inv),
      hint: invoiceHint(inv, now),
      path: `/finance/invoices/${inv._id}`,
      score: 0.5,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 15);
}

function invoiceLabel(inv: any): string {
  const num = inv.invoiceNumber ? `#${inv.invoiceNumber}` : "Invoice";
  const due =
    inv.amountDue != null
      ? formatCurrency(inv.amountDue, inv.currencyCode)
      : "";
  return due ? `${num} — ${due}` : num;
}

function invoiceHint(inv: any, now: number): string {
  const status = String(inv.status ?? "");
  if (status === "overdue" && inv.dueDate != null) {
    const days = Math.max(0, Math.floor((now - inv.dueDate) / DAY_MS));
    return `Overdue ${days}d`;
  }
  return status ? `Invoice · ${status}` : "Invoice";
}

function formatCurrency(amount: number, currencyCode?: string | null): string {
  try {
    const cur = currencyCode || "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `$${Math.round(Number(amount) || 0)}`;
  }
}
