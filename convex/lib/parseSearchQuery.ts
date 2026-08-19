// Pure NL parse + invoice-number matching for Ctrl-K.
// Kept out of convex/search.ts so tests can lock QA leftovers without
// importing the generated Convex server.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ParsedSearchQuery {
  term: string;
  kinds: Set<string>;
  statuses: Set<string>;
  /** Inclusive lower / exclusive upper bounds on a date (ms). null = unbounded. */
  startAfter: number | null;
  startBefore: number | null;
  /** Age threshold in days for "aged over N days" invoice intent. */
  agedOverDays: number | null;
  /**
   * Invoice-number tokens from the raw string (e.g. "#INV-2026-QA1" →
   * "inv-2026-qa1"). Hyphens are part of the token; do not split them.
   */
  invoiceNumbers: string[];
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

/** Requires the hyphen after INV so the word "invoices" is not a number. */
const INVOICE_NUMBER_RE = /#?(inv-[a-z0-9][a-z0-9-]*)/gi;

const RAW_DOCUMENT_ID_PATTERN = /^[a-z0-9]{24,}$/i;

const UNPAID_STATUSES = [
  "sent",
  "viewed",
  "overdue",
  "partial",
  "draft",
] as const;

export function extractInvoiceNumbers(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(INVOICE_NUMBER_RE.source, "gi");
  for (const match of raw.matchAll(re)) {
    const token = (match[1] ?? "").toLowerCase();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function stripInvoiceNumbers(raw: string): string {
  return raw.replace(new RegExp(INVOICE_NUMBER_RE.source, "gi"), " ");
}

export function normalizeInvoiceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Human invoice number, matching folio/payments display: a stored raw
 * Convex id becomes INV- + last 6 of the invoice document id.
 */
export function displayInvoiceNumber(
  invoiceNumber: unknown,
  invoiceId: unknown,
): string {
  const stored = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
  if (!stored) return "";
  if (RAW_DOCUMENT_ID_PATTERN.test(stored)) {
    const id = String(invoiceId ?? stored);
    return `INV-${id.slice(-6).toUpperCase()}`;
  }
  return stored;
}

export function parseSearchQuery(raw: string, now: number): ParsedSearchQuery {
  const invoiceNumbers = extractInvoiceNumbers(raw);
  const remainder = stripInvoiceNumbers(raw);
  const tokens = remainder
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

  if (invoiceNumbers.length > 0) kinds.add("invoice");

  return {
    term: termTokens.join(" ").trim(),
    kinds,
    statuses,
    startAfter,
    startBefore,
    agedOverDays,
    invoiceNumbers,
  };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function shouldQueryInvoices(parsed: ParsedSearchQuery): boolean {
  if (parsed.invoiceNumbers.length > 0) return true;
  if (parsed.statuses.size > 0) return true;
  if (parsed.agedOverDays !== null) return true;
  if (parsed.kinds.has("invoice")) return true;
  return false;
}

/**
 * Statuses to keep. Null = number lookup with no status words: include paid.
 */
export function invoiceStatusFilter(
  parsed: ParsedSearchQuery,
): Set<string> | null {
  const statuses = new Set<string>();
  for (const s of parsed.statuses) {
    if (s === "unpaid") {
      for (const x of UNPAID_STATUSES) statuses.add(x);
    } else if (s === "overdue") statuses.add("overdue");
    else if (s === "paid") statuses.add("paid");
    else if (s === "draft") statuses.add("draft");
    else if (s === "sent") statuses.add("sent");
  }
  if (parsed.invoiceNumbers.length > 0) {
    return statuses.size > 0 ? statuses : null;
  }
  if (
    statuses.size === 0 &&
    (parsed.kinds.has("invoice") || parsed.agedOverDays !== null)
  ) {
    for (const x of UNPAID_STATUSES) statuses.add(x);
  }
  return statuses.size > 0 ? statuses : null;
}

export function invoiceMatchesQuery(
  inv: { invoiceNumber?: unknown; _id?: unknown },
  parsed: ParsedSearchQuery,
): boolean {
  const stored = String(inv.invoiceNumber ?? "");
  const display = displayInvoiceNumber(inv.invoiceNumber, inv._id);
  const haystacks = [stored, display]
    .map(normalizeInvoiceKey)
    .filter((h) => h.length > 0);

  if (parsed.invoiceNumbers.length > 0) {
    return parsed.invoiceNumbers.some((token) => {
      const q = normalizeInvoiceKey(token);
      if (q.length < 4) return false;
      return haystacks.some((h) => h.includes(q));
    });
  }

  if (!parsed.term) return true;
  const q = normalizeInvoiceKey(parsed.term);
  if (q.length < 2) return true;
  return haystacks.some((h) => h.includes(q));
}

export function invoiceSearchLabel(inv: {
  invoiceNumber?: unknown;
  _id?: unknown;
  amountDue?: unknown;
  currencyCode?: unknown;
}): string {
  const formatted = displayInvoiceNumber(inv.invoiceNumber, inv._id);
  const num = formatted ? `#${formatted.replace(/^#/, "")}` : "Invoice";
  const due =
    inv.amountDue != null
      ? formatSearchCurrency(inv.amountDue, inv.currencyCode)
      : "";
  return due ? `${num} — ${due}` : num;
}

function formatSearchCurrency(amount: unknown, currencyCode?: unknown): string {
  try {
    const cur =
      typeof currencyCode === "string" && currencyCode ? currencyCode : "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `$${Math.round(Number(amount) || 0)}`;
  }
}
