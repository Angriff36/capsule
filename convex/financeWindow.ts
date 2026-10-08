// Growing tables read one page at a time. Finance, sales and report screens
// used to load each of these tables whole through the generated listX query
// (every row the company ever had, in one read); on the live server those
// loads ran out of time and the screens hung on "Still loading".
//
// `page` returns one page of one table, newest first, with the same read
// rule, deletedAt filter, field decryption and computed fields as the
// generated list query of that table. A screen shows the first page and
// reads the next only when the user asks (src/features/reports/pagedRows.ts);
// each call reads one page only.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, TableNames } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { canRead } from "./search";

type Row = Record<string, unknown>;

interface TableRule {
  /**
   * Read capabilities (any one) of the generated read policy; "anyone" when
   * that policy lets every signed-in member of the company read.
   */
  read: readonly string[] | "anyone";
  /** The generated list drops soft-deleted rows. */
  live: boolean;
  /** Entity name and encrypted fields the generated list decrypts. */
  encrypted?: { entity: string; fields: readonly string[] };
  /** Computed, stripped or masked fields, as the generated list returns. */
  map?: (row: Row, auth: AppAuthContext) => Row;
  /** A read rule that looks at each row, as the generated list applies. */
  rowRead?: (auth: AppAuthContext, row: Row) => boolean;
}

const FINANCE_OR_MANAGE = ["financeAccess", "manageAccess"] as const;
const SALES = ["salesAccess"] as const;
const STAFF = ["staffAccess"] as const;

/** Invoice hydration, as the generated listInvoice. */
function invoiceRow(row: Row): Row {
  const code = row.currencyCode as string | null | undefined;
  const invoiceCurrencyCode =
    code != null && code.trim().length === 3 ? code : "USD";
  const rate = row.exchangeRate as number | null | undefined;
  const safeExchangeRate = rate != null && rate > 0 ? rate : 1;
  return {
    ...row,
    invoiceCurrencyCode,
    safeExchangeRate,
    functionalCurrencyTotal: Math.round(
      (row.total as number) * safeExchangeRate,
    ),
    functionalCurrencyAmountDue: Math.round(
      (row.amountDue as number) * safeExchangeRate,
    ),
  };
}

/** Lead hydration, as the generated listLead. */
function leadRow(row: Row): Row {
  return {
    ...row,
    displayName:
      row.leadType === "company"
        ? row.companyName
        : `${row.givenName as string} ${row.familyName as string}`,
    isClosed: row.closedAt != null,
  };
}

/** The generated listPayrollInput strips pay amounts. */
function payrollInputRow(row: Row): Row {
  const out = { ...row };
  delete out.hourlyRate;
  delete out.overtimeRate;
  delete out.grossAmount;
  return out;
}

/** Masked contact fields, as the generated listQuoteSubmission. */
function quoteSubmissionRow(row: Row, auth: AppAuthContext): Row {
  if (canRead(auth, ["salesAccess"])) return row;
  const out = { ...row };
  if (out.email != null) {
    const s = String(out.email);
    const at = s.indexOf("@");
    out.email = at <= 0 ? "***" : `${s[0]}***@${s.slice(at + 1)}`;
  }
  if (out.phone != null) {
    const digits = String(out.phone).replace(/[^0-9]/g, "");
    out.phone = digits.length < 4 ? "***" : `***-***-${digits.slice(-4)}`;
  }
  return out;
}

/** The caller passes the table's generated read policy. */
function mayRead(auth: AppAuthContext, read: TableRule["read"]): boolean {
  return read === "anyone" || canRead(auth, read);
}

const RULES = {
  invoices: { read: FINANCE_OR_MANAGE, live: true, map: invoiceRow },
  payments: { read: ["financeAccess"], live: true },
  creditMemos: { read: ["financeAccess"], live: true },
  eventCloseouts: {
    read: ["financeAccess", "eventManageAccess"],
    live: true,
  },
  revenueAttributions: {
    read: ["financeAccess", "salesAccess"],
    live: true,
  },
  leftoverDispositions: {
    read: ["financeAccess", "eventAccess", "kitchenAccess", "manageAccess"],
    live: true,
  },
  payrollExportRecords: {
    read: ["financeManageAccess", "workforceManageAccess"],
    live: true,
  },
  payrollInputs: {
    read: ["financeManageAccess"],
    live: true,
    encrypted: {
      entity: "PayrollInput",
      fields: ["hourlyRate", "overtimeRate", "grossAmount", "notes"],
    },
    map: payrollInputRow,
  },
  eventAssignments: {
    read: ["workforceAccess", "workforceSelfAccess"],
    live: true,
    encrypted: { entity: "EventAssignment", fields: ["notes"] },
  },
  proposals: { read: SALES, live: true },
  proposalLineItems: { read: SALES, live: true },
  proposalEnhancements: { read: SALES, live: true },
  proposalDishSelections: { read: SALES, live: true },
  proposalRevisions: { read: SALES, live: true },
  shareLinks: { read: SALES, live: true },
  signatureRequests: { read: SALES, live: true },
  contracts: { read: SALES, live: true },
  tastings: { read: SALES, live: true },
  clientOutreachTasks: { read: SALES, live: false },
  leads: {
    read: SALES,
    live: true,
    encrypted: { entity: "Lead", fields: ["email", "phone"] },
    map: leadRow,
  },
  dateHolds: { read: ["salesAccess", "eventAccess"], live: true },
  dateWaitlistEntries: { read: ["salesAccess", "eventAccess"], live: true },
  leadershipItems: { read: ["manageAccess"], live: true },
  messageThreads: { read: STAFF, live: true },
  messages: { read: STAFF, live: true },
  eventTimelineActivities: { read: STAFF, live: true },
  eventNumberAssignments: { read: STAFF, live: false },
  syncErrors: { read: STAFF, live: true },
  prepTasks: { read: ["kitchenAccess", "manageAccess"], live: true },
  packLists: {
    read: STAFF,
    live: true,
    encrypted: { entity: "PackList", fields: ["notes"] },
  },
  deliveries: {
    read: ["logisticsAccess", "manageAccess"],
    live: true,
    encrypted: { entity: "Delivery", fields: ["notes"] },
  },
  ingredientDemands: {
    read: ["inventoryAccess", "manageAccess"],
    live: true,
  },
  quoteSubmissions: { read: "anyone", live: true, map: quoteSubmissionRow },
  // shiftRead: workforce, or self-service staff for their own shifts and
  // any event's shifts (as convex/workforceWindow.ts readsShift).
  shifts: {
    read: ["workforceAccess", "workforceSelfAccess"],
    live: true,
    encrypted: { entity: "Shift", fields: ["notes"] },
    rowRead: (auth, row) =>
      canRead(auth, ["workforceAccess"]) ||
      (canRead(auth, ["workforceSelfAccess"]) &&
        ((auth.personId != null && row.personId === auth.personId) ||
          row.eventId != null)),
  },
} satisfies Partial<Record<TableNames, TableRule>>;

export type PagedTable = keyof typeof RULES;

const tableValidator = v.union(
  ...(Object.keys(RULES) as PagedTable[]).map((table) => v.literal(table)),
);

/**
 * Indexes on [tenantId, ...fields] (manifest.config.yaml), by table and by
 * the comma-joined fields a page filters on: a date window over those
 * fields, those fields empty, or those fields holding given texts. A filter
 * with one of these reads only its rows; any other filter reads page by page.
 */
const FIELD_INDEXES: { [T in PagedTable]?: Record<string, string> } = {
  payments: { settledAt: "by_tenantId_and_settledAt" },
  invoices: { "issuedAt,createdAt": "by_tenantId_and_issuedAt_and_createdAt" },
  eventCloseouts: {
    "finalizedAt,capturedAt,createdAt":
      "by_tenantId_and_finalizedAt_and_capturedAt_and_createdAt",
  },
  leads: {
    createdAt: "by_tenantId_and_createdAt",
    closedAt: "by_tenantId_and_closedAt",
  },
  payrollInputs: { periodStart: "by_tenantId_and_periodStart" },
  revenueAttributions: { appliedAt: "by_tenantId_and_appliedAt" },
  prepTasks: { dueAt: "by_tenantId_and_dueAt" },
  clientOutreachTasks: { resolvedAt: "by_tenantId_and_resolvedAt" },
  syncErrors: { status: "by_tenantId_and_status" },
};

/** An index range over field names known only at run time. */
interface FieldRange {
  eq(field: string, value: unknown): FieldRange;
  gte(field: string, value: number): FieldRange;
  lt(field: string, value: number): FieldRange;
}
interface FieldIndexed {
  withIndex(
    index: string,
    range: (q: FieldRange) => FieldRange,
  ): { collect(): Promise<Row[]> };
}

/** An empty field is stored as undefined or null; each is its own range. */
const EMPTY = [undefined, null] as const;

/** Every way `count` fields can each be empty (undefined or null). */
function emptyCombos(count: number): Array<Array<null | undefined>> {
  let combos: Array<Array<null | undefined>> = [[]];
  for (let i = 0; i < count; i += 1)
    combos = combos.flatMap((combo) => EMPTY.map((empty) => [...combo, empty]));
  return combos;
}

type PageFilters = {
  window?: { fields: string[]; ranges: { from: number; to: number }[] };
  emptyFields?: string[];
  fieldEquals?: { field: string; value: string }[];
};

/**
 * The rows a filter can keep, read through the table's index on its fields,
 * newest first (as the tenant index pages them); null when no index fits.
 * A window over fields [a, b, c] (the date is the first one set) reads a in
 * range, then a empty and b in range, then a and b empty and c in range.
 */
async function indexedRows(
  ctx: QueryCtx,
  table: PagedTable,
  tenantId: string,
  { window, emptyFields, fieldEquals }: PageFilters,
): Promise<Row[] | null> {
  const indexes = FIELD_INDEXES[table];
  if (!indexes) return null;
  const db = ctx.db.query(table) as unknown as FieldIndexed;
  const ranges: Array<(q: FieldRange) => FieldRange> = [];
  const tenant = (q: FieldRange) => q.eq("tenantId", tenantId);
  const windowIndex = window && indexes[window.fields.join(",")];
  const emptyIndex = emptyFields && indexes[emptyFields.join(",")];
  const equalsIndex =
    fieldEquals && indexes[fieldEquals.map(({ field }) => field).join(",")];
  let index: string;
  if (window && windowIndex) {
    index = windowIndex;
    window.fields.forEach((field, at) => {
      const before = window.fields.slice(0, at);
      for (const combo of emptyCombos(at))
        for (const { from, to } of window.ranges)
          ranges.push((q) =>
            before
              .reduce((r, name, i) => r.eq(name, combo[i]), tenant(q))
              .gte(field, from)
              .lt(field, to),
          );
    });
  } else if (emptyFields && emptyIndex) {
    index = emptyIndex;
    for (const combo of emptyCombos(emptyFields.length))
      ranges.push((q) =>
        emptyFields.reduce((r, name, i) => r.eq(name, combo[i]), tenant(q)),
      );
  } else if (fieldEquals && equalsIndex) {
    index = equalsIndex;
    ranges.push((q) =>
      fieldEquals.reduce(
        (r, { field, value }) => r.eq(field, value),
        tenant(q),
      ),
    );
  } else return null;
  const byId = new Map<unknown, Row>();
  for (const range of ranges)
    for (const row of await db.withIndex(index, range).collect())
      byId.set(row._id, row);
  return [...byId.values()].sort(
    (a, b) => (b._creationTime as number) - (a._creationTime as number),
  );
}

/** A number date, or a date string (yyyy-mm-dd...) parsed; else null. */
function dateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Field decryption, as the generated list's __decryptDoc. */
async function decryptRow(
  ctx: QueryCtx,
  entity: string,
  fields: readonly string[],
  doc: Row,
): Promise<Row> {
  const out = { ...doc };
  for (const property of fields) {
    const raw = out[property];
    if (typeof raw !== "string") continue;
    let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null;
    try {
      envelope = JSON.parse(raw) as typeof envelope;
    } catch {
      continue;
    }
    const looksEncrypted =
      envelope != null &&
      typeof envelope === "object" &&
      "v" in envelope &&
      "kid" in envelope &&
      "ct" in envelope;
    if (!looksEncrypted || !envelope) continue;
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
  return out;
}

/**
 * One page of one table, by the tenant index. A role the generated list
 * denies gets an empty, finished page, as that list returns [].
 */
export const page = query({
  args: {
    table: tableValidator,
    paginationOpts: paginationOptsValidator,
    /**
     * Keep only rows whose date (the first of `fields` that is set) falls in
     * one of the [from, to) ranges. With an index on those fields
     * (FIELD_INDEXES) only the window's rows are read, in one finished page;
     * otherwise each page is read whole and only the window's rows are sent.
     */
    window: v.optional(
      v.object({
        fields: v.array(v.string()),
        ranges: v.array(v.object({ from: v.number(), to: v.number() })),
      }),
    ),
    /**
     * Keep only rows where every one of these fields is empty (e.g. open
     * leads: closedAt). Read as `window` is.
     */
    emptyFields: v.optional(v.array(v.string())),
    /**
     * Keep only rows whose field holds this text (e.g. status "pending").
     * Read as `window` is.
     */
    fieldEquals: v.optional(
      v.array(v.object({ field: v.string(), value: v.string() })),
    ),
  },
  handler: async (
    ctx,
    { table, paginationOpts, window, emptyFields, fieldEquals },
  ) => {
    const auth = await getAuthContext(ctx);
    const rule: TableRule = RULES[table];
    if (!auth.tenantId || !mayRead(auth, rule.read)) {
      return {
        page: [] as Doc<PagedTable>[],
        isDone: true,
        continueCursor: "",
      };
    }
    const tenantId = auth.tenantId;
    const indexed = await indexedRows(ctx, table, tenantId, {
      window,
      emptyFields,
      fieldEquals,
    });
    const result = indexed
      ? { page: indexed, isDone: true, continueCursor: "" }
      : await ctx.db
          .query(table)
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .order("desc")
          .paginate(paginationOpts);
    let rows = result.page as unknown as Row[];
    if (rule.live) rows = rows.filter((row) => row.deletedAt == null);
    if (window)
      rows = rows.filter((row) => {
        const at = window.fields
          .map((field) => dateValue(row[field]))
          .find((value) => value != null);
        return (
          at != null &&
          window.ranges.some((range) => at >= range.from && at < range.to)
        );
      });
    const { encrypted, map } = rule;
    if (encrypted)
      rows = await Promise.all(
        rows.map((row) =>
          decryptRow(ctx, encrypted.entity, encrypted.fields, row),
        ),
      );
    if (emptyFields)
      rows = rows.filter((row) =>
        emptyFields.every((field) => row[field] == null),
      );
    if (fieldEquals)
      rows = rows.filter((row) =>
        fieldEquals.every(({ field, value }) => row[field] === value),
      );
    const { rowRead } = rule;
    if (rowRead) rows = rows.filter((row) => rowRead(auth, row));
    if (map) rows = rows.map((row) => map(row, auth));
    return { ...result, page: rows as unknown as Doc<PagedTable>[] };
  },
});

/** Whether the caller's role may read this table (the generated read rule). */
export const canReadTable = query({
  args: { table: tableValidator },
  handler: async (ctx, { table }) => {
    const auth = await getAuthContext(ctx);
    const rule: TableRule = RULES[table];
    return !!auth.tenantId && mayRead(auth, rule.read);
  },
});

/**
 * One calendar year of leftover dispositions (dispositionDate is a
 * yyyy-mm-dd day), through the date index, plus the first year this company
 * recorded any, for the year picker. Same read rule as the generated list.
 */
export const leftoversInYear = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, RULES.leftoverDispositions.read)) {
      return { rows: [] as Doc<"leftoverDispositions">[], firstYear: null };
    }
    const tenantId = auth.tenantId;
    const rows = (
      await ctx.db
        .query("leftoverDispositions")
        .withIndex("by_dispositionDate", (q) =>
          q
            .gte("dispositionDate", `${year}-01-01`)
            .lt("dispositionDate", `${year + 1}-01-01`),
        )
        .collect()
    ).filter((row) => row.tenantId === tenantId && row.deletedAt == null);
    const first = await ctx.db
      .query("leftoverDispositions")
      .withIndex("by_dispositionDate")
      .filter((q) =>
        q.and(
          q.eq(q.field("tenantId"), tenantId),
          q.or(
            q.eq(q.field("deletedAt"), undefined),
            q.eq(q.field("deletedAt"), null),
          ),
        ),
      )
      .first();
    const firstYear = first ? Number(first.dispositionDate.slice(0, 4)) : null;
    return {
      rows,
      firstYear: Number.isInteger(firstYear) ? firstYear : null,
    };
  },
});

/**
 * Date holds and waitlist entries on `today` (a yyyy-mm-dd day) or later,
 * through the tenant's date indexes: what the date board shows. Same read
 * rules as the generated lists; a role that may not read them gets [].
 */
export const datesFrom = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return { holds: [], waitlist: [] };
    const tenantId = auth.tenantId;
    const holds = canRead(auth, RULES.dateHolds.read)
      ? (
          await ctx.db
            .query("dateHolds")
            .withIndex("by_tenantId_and_holdDate_and_expiresAt", (q) =>
              q.eq("tenantId", tenantId).gte("holdDate", today),
            )
            .collect()
        ).filter((row) => row.deletedAt == null)
      : [];
    const waitlist = canRead(auth, RULES.dateWaitlistEntries.read)
      ? (
          await ctx.db
            .query("dateWaitlistEntries")
            .withIndex("by_tenantId_and_holdDate_and_queuedAt", (q) =>
              q.eq("tenantId", tenantId).gte("holdDate", today),
            )
            .collect()
        ).filter((row) => row.deletedAt == null)
      : [];
    return { holds, waitlist };
  },
});

/**
 * When each listed thread last had a message (sentAt, else createdAt), for
 * the inbox list: the listed threads' messages are read, only times are
 * sent. Same read rule as the generated message list.
 */
export const threadLastMessageAt = query({
  args: { threadIds: v.array(v.id("messageThreads")) },
  handler: async (ctx, { threadIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Record<string, number> = {};
    if (!auth.tenantId || !canRead(auth, RULES.messages.read)) return out;
    const tenantId = auth.tenantId;
    for (const threadId of [...new Set(threadIds)].slice(0, 200)) {
      const rows = await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .collect();
      let last = 0;
      for (const row of rows) {
        if (row.tenantId !== tenantId || row.deletedAt != null) continue;
        last = Math.max(last, row.sentAt ?? row.createdAt ?? 0);
      }
      out[threadId] = last;
    }
    return out;
  },
});
