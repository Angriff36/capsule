import { v } from "convex/values";
import { TPP_FINANCIAL_REPORTS } from "../../src/features/reports/tpp/catalog.financial";
import type {
  TppColumn,
  TppMeasure,
  TppReportResult,
  TppRow,
  TppTotal,
} from "../../src/features/reports/tpp/types";
import { query } from "../_generated/server";
import { getAuthContext } from "../lib/authContext";
import {
  REPORT_ROW_LIMIT,
  inDateRange,
  isLiveTenantRow,
  requireReportTenant,
} from "./shared";

const REPORT_IDS = new Set(TPP_FINANCIAL_REPORTS.map((report) => report.id));
const BILLED_STATUSES = new Set([
  "sent",
  "viewed",
  "overdue",
  "partial",
  "paid",
]);
const EARNINGS_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "finance_manager",
  "workforce_manager",
]);
type Parameters = Record<string, string | string[] | boolean | number>;

function reportTitle(reportId: string): string {
  return (
    TPP_FINANCIAL_REPORTS.find((report) => report.id === reportId)?.name ??
    reportId
  );
}
function moneyTotal(rows: TppRow[], key: string, label: string): TppTotal {
  return {
    key,
    label,
    value: rows.reduce((sum, row) => {
      const value = row.values[key];
      return sum + (typeof value === "number" ? value : 0);
    }, 0),
    kind: "money",
  };
}
function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}
function financial(
  reportId: string,
  columns: TppColumn[],
  rows: TppRow[],
  totals: TppTotal[] = [],
  measures: TppMeasure[] = [],
): TppReportResult {
  return {
    kind: "financial",
    title: reportTitle(reportId),
    columns,
    rows,
    groups: [],
    totals,
    measures,
  };
}
function clientName(
  client:
    | {
        companyName?: string | null;
        givenName?: string | null;
        familyName?: string | null;
      }
    | undefined,
): string {
  return (
    client?.companyName ||
    [client?.givenName, client?.familyName].filter(Boolean).join(" ") ||
    "Unknown contact"
  );
}
function range(parameters: Parameters): [number, number] {
  return [
    Number(parameters.dateRangeStart ?? 0),
    Number(parameters.dateRangeEnd ?? Number.MAX_SAFE_INTEGER),
  ];
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function invoiceLines(value: unknown): {
  description: string;
  category: string;
  quantity: number;
  amount: number;
  cost: number;
  tax: number;
}[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    if (!item) return [];
    const quantity = Number(item.quantity ?? 1);
    const amount = Number(
      item.amount ?? item.total ?? Number(item.unitPrice ?? 0) * quantity,
    );
    const cost = Number(item.cost ?? Number(item.unitCost ?? 0) * quantity);
    return [
      {
        description: String(item.description ?? item.name ?? "Line item"),
        category: String(item.category ?? item.type ?? "other"),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        amount: Number.isFinite(amount) ? amount : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        tax: Number(item.taxAmount ?? 0) || 0,
      },
    ];
  });
}

export const run = query({
  args: { reportId: v.string(), parameters: v.any() },
  handler: async (ctx, args): Promise<TppReportResult> => {
    const tenantId = await requireReportTenant(ctx);
    if (!REPORT_IDS.has(args.reportId))
      throw new Error("Unknown Financial report");
    const parameters = (args.parameters ?? {}) as Parameters;
    const [events, invoices, clients] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT),
      ctx.db
        .query("invoices")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT),
      ctx.db
        .query("clients")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT),
    ]);
    const eventById = new Map(
      events
        .filter((row) => isLiveTenantRow(row, tenantId))
        .map((row) => [String(row._id), row]),
    );
    const clientById = new Map(
      clients
        .filter((row) => isLiveTenantRow(row, tenantId))
        .map((row) => [String(row._id), row]),
    );
    const [start, end] = range(parameters);
    const billed = invoices.filter(
      (row) =>
        isLiveTenantRow(row, tenantId) && BILLED_STATUSES.has(row.status),
    );
    const rangedInvoices = billed.filter((row) =>
      inDateRange(
        row.issuedAt ??
          (row.eventId ? eventById.get(String(row.eventId))?.startsAt : null),
        start,
        end,
      ),
    );

    const arIds = new Set([
      "ar-aging-detail",
      "accounts-receivable",
      "accounts-receivable-new",
      "contact-statement-receivables",
    ]);
    if (arIds.has(args.reportId)) {
      const asOf = Number(parameters.asOf ?? Date.now());
      const selectedClient =
        typeof parameters.clientId === "string" ? parameters.clientId : null;
      const rows = billed
        .filter(
          (row) =>
            row.amountDue > 0 &&
            (!selectedClient || String(row.clientId) === selectedClient),
        )
        .map((row) => {
          const daysPastDue = row.dueDate
            ? Math.max(0, Math.floor((asOf - row.dueDate) / 86_400_000))
            : 0;
          const bucket =
            daysPastDue === 0
              ? "Current"
              : daysPastDue <= 30
                ? "1–30"
                : daysPastDue <= 60
                  ? "31–60"
                  : daysPastDue <= 90
                    ? "61–90"
                    : "90+";
          return {
            id: row._id,
            values: {
              contact: clientName(clientById.get(String(row.clientId))),
              invoice: row.invoiceNumber ?? "",
              issued: row.issuedAt ?? null,
              due: row.dueDate ?? null,
              total: row.total,
              paid: row.amountPaid,
              balance: row.amountDue,
              days: daysPastDue,
              bucket,
            },
          };
        });
      return financial(
        args.reportId,
        [
          { key: "contact", label: "Contact", kind: "text" },
          { key: "invoice", label: "Invoice", kind: "text" },
          { key: "issued", label: "Issued", kind: "date" },
          { key: "due", label: "Due", kind: "date" },
          { key: "total", label: "Invoice total", kind: "money" },
          { key: "paid", label: "Paid", kind: "money" },
          { key: "balance", label: "Balance", kind: "money" },
          { key: "days", label: "Days past due", kind: "number" },
          { key: "bucket", label: "Aging", kind: "text" },
        ],
        rows,
        [moneyTotal(rows, "balance", "Accounts receivable")],
      );
    }

    if (
      [
        "contact-payments",
        "credit-card-transactions",
        "payment-totals",
      ].includes(args.reportId)
    ) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      let settled = payments.filter(
        (row) =>
          isLiveTenantRow(row, tenantId) &&
          row.status === "completed" &&
          inDateRange(row.settledAt ?? row.recordedAt, start, end),
      );
      if (args.reportId === "credit-card-transactions")
        settled = settled.filter((row) => row.method === "card");
      if (args.reportId === "payment-totals") {
        const totals = new Map<string, number>();
        for (const payment of settled)
          totals.set(
            payment.method,
            (totals.get(payment.method) ?? 0) + payment.amount,
          );
        const rows = [...totals].map(([method, amount]) => ({
          id: method,
          values: { method, amount },
        }));
        return financial(
          args.reportId,
          [
            { key: "method", label: "Payment method", kind: "text" },
            { key: "amount", label: "Collected", kind: "money" },
          ],
          rows,
          [moneyTotal(rows, "amount", "Payments collected")],
        );
      }
      const rows = settled.map((row) => ({
        id: row._id,
        values: {
          date: row.settledAt ?? row.recordedAt ?? null,
          contact: clientName(clientById.get(String(row.clientId))),
          method: row.method,
          amount: row.amount,
          source: row.externalSource ?? "",
          transaction:
            row.externalPaymentId ?? row.providerTransactionIds ?? "",
          reconciliation: row.reconciliationStatus,
        },
      }));
      return financial(
        args.reportId,
        [
          { key: "date", label: "Payment date", kind: "date" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "method", label: "Method", kind: "text" },
          { key: "amount", label: "Amount", kind: "money" },
          { key: "source", label: "Source", kind: "text" },
          { key: "transaction", label: "Transaction", kind: "text" },
          { key: "reconciliation", label: "Reconciliation", kind: "text" },
        ],
        rows,
        [moneyTotal(rows, "amount", "Payments collected")],
      );
    }

    if (args.reportId === "outstanding-deposits") {
      const rows = rangedInvoices
        .filter(
          (row) => (row.depositAmount ?? 0) > 0 && row.depositPaidAt == null,
        )
        .map((row) => ({
          id: row._id,
          values: {
            event: row.eventId
              ? (eventById.get(String(row.eventId))?.title ?? "")
              : "",
            contact: clientName(clientById.get(String(row.clientId))),
            date: row.eventId
              ? (eventById.get(String(row.eventId))?.startsAt ?? null)
              : null,
            deposit: row.depositAmount ?? 0,
            due: row.dueDate ?? null,
            status: row.status,
          },
        }));
      return financial(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "date", label: "Event date", kind: "date" },
          { key: "deposit", label: "Deposit due", kind: "money" },
          { key: "due", label: "Due date", kind: "date" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows,
        [moneyTotal(rows, "deposit", "Outstanding deposits")],
      );
    }

    if (args.reportId === "outstanding-proposals") {
      const proposals = await ctx.db
        .query("proposals")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const rows = proposals
        .filter(
          (row) =>
            isLiveTenantRow(row, tenantId) &&
            ["sent", "viewed"].includes(row.status) &&
            inDateRange(row.eventDate ?? row.sentAt, start, end),
        )
        .map((row) => ({
          id: row._id,
          values: {
            proposal: row.proposalNumber ?? row.title,
            contact: clientName(clientById.get(String(row.clientId))),
            date: row.eventDate ?? null,
            guests: row.guestCount,
            total: row.total,
            status: row.status,
            expires: row.expiresAt ?? null,
          },
        }));
      return financial(
        args.reportId,
        [
          { key: "proposal", label: "Proposal", kind: "text" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "date", label: "Event date", kind: "date" },
          { key: "guests", label: "Guests", kind: "number" },
          { key: "total", label: "Value", kind: "money" },
          { key: "status", label: "Status", kind: "text" },
          { key: "expires", label: "Expires", kind: "date" },
        ],
        rows,
        [moneyTotal(rows, "total", "Outstanding proposal value")],
      );
    }

    if (args.reportId === "inventory-cost-changes") {
      const [observations, ingredients, vendors] = await Promise.all([
        ctx.db
          .query("ingredientPriceObservations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("ingredients")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("vendors")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const ingredientById = new Map(
        ingredients.map((row) => [String(row._id), row.name]),
      );
      const vendorById = new Map(
        vendors.map((row) => [String(row._id), row.name]),
      );
      const grouped = new Map<string, typeof observations>();
      for (const item of observations.filter(
        (row) =>
          isLiveTenantRow(row, tenantId) &&
          inDateRange(row.observedAt ?? row.createdAt, start, end),
      )) {
        const key = String(item.ingredientId);
        grouped.set(key, [...(grouped.get(key) ?? []), item]);
      }
      const rows = [...grouped].map(([ingredientId, items]) => {
        const sorted = items.sort(
          (a, b) => (a.observedAt ?? 0) - (b.observedAt ?? 0),
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        return {
          id: ingredientId,
          values: {
            item: ingredientById.get(ingredientId) ?? "",
            vendor: vendorById.get(String(last.vendorId)) ?? "",
            first: first.unitPrice,
            latest: last.unitPrice,
            change:
              first.unitPrice === 0
                ? 0
                : percent(last.unitPrice - first.unitPrice, first.unitPrice),
            observed: last.observedAt ?? null,
          },
        };
      });
      return financial(
        args.reportId,
        [
          { key: "item", label: "Inventory item", kind: "text" },
          { key: "vendor", label: "Latest vendor", kind: "text" },
          { key: "first", label: "First cost", kind: "money" },
          { key: "latest", label: "Latest cost", kind: "money" },
          { key: "change", label: "Change %", kind: "number" },
          { key: "observed", label: "Last observed", kind: "date" },
        ],
        rows,
      );
    }

    if (
      ["profit-summary", "event-food-costing-summary"].includes(args.reportId)
    ) {
      const closeouts = await ctx.db
        .query("eventCloseouts")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .take(REPORT_ROW_LIMIT);
      const rows = closeouts
        .filter(
          (row) =>
            isLiveTenantRow(row, tenantId) &&
            row.status === "finalized" &&
            inDateRange(
              eventById.get(String(row.eventId))?.startsAt,
              start,
              end,
            ),
        )
        .map((row) => ({
          id: row._id,
          values: {
            event: eventById.get(String(row.eventId))?.title ?? "",
            date: eventById.get(String(row.eventId))?.startsAt ?? null,
            revenue: row.actualRevenue,
            foodCost: row.actualIngredientCost,
            wasteCost: row.actualWasteCost,
            laborCost: row.actualLaborCost,
            vendorCost: row.actualVendorCost,
            totalCost: row.totalActualCost,
            profit: row.grossProfit,
            margin: percent(row.grossProfit, row.actualRevenue),
            coverage: row.notes ?? "",
          },
        }));
      const revenue = rows.reduce(
        (sum, row) => sum + Number(row.values.revenue),
        0,
      );
      const cost = rows.reduce(
        (sum, row) => sum + Number(row.values.totalCost),
        0,
      );
      const profit = rows.reduce(
        (sum, row) => sum + Number(row.values.profit),
        0,
      );
      return financial(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "date", label: "Event date", kind: "date" },
          { key: "revenue", label: "Revenue", kind: "money" },
          { key: "foodCost", label: "Food cost", kind: "money" },
          { key: "wasteCost", label: "Waste cost", kind: "money" },
          { key: "laborCost", label: "Labor cost", kind: "money" },
          { key: "vendorCost", label: "Vendor cost", kind: "money" },
          { key: "totalCost", label: "Total cost", kind: "money" },
          { key: "profit", label: "Profit", kind: "money" },
          { key: "margin", label: "Profit %", kind: "number" },
        ],
        rows,
        [
          moneyTotal(rows, "revenue", "Revenue"),
          moneyTotal(rows, "totalCost", "Cost"),
          moneyTotal(rows, "profit", "Profit"),
        ],
        [
          {
            key: "revenue",
            label: "Revenue",
            value: revenue,
            kind: "money",
            emphasis: "primary",
          },
          { key: "cost", label: "Cost", value: cost, kind: "money" },
          {
            key: "profit",
            label: "Profit",
            value: profit,
            kind: "money",
            emphasis: "primary",
          },
          {
            key: "margin",
            label: "Profit %",
            value: percent(profit, revenue),
            kind: "percentage",
          },
        ],
      );
    }

    if (args.reportId === "staff-earnings") {
      const auth = await getAuthContext(ctx);
      if (!EARNINGS_ROLES.has(auth.role))
        throw new Error(
          "Staff earnings are available to workforce and finance managers",
        );
      const [payroll, people, eventRows] = await Promise.all([
        ctx.db
          .query("payrollInputs")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("people")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
        ctx.db
          .query("events")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .take(REPORT_ROW_LIMIT),
      ]);
      const peopleById = new Map(people.map((row) => [String(row._id), row]));
      const eventsById = new Map(
        eventRows.map((row) => [String(row._id), row.title]),
      );
      const rows = payroll
        .filter(
          (row) =>
            isLiveTenantRow(row, tenantId) &&
            row.status === "finalized" &&
            row.periodStart <= end &&
            row.periodEnd >= start,
        )
        .map((row) => ({
          id: row._id,
          values: {
            staff:
              `${peopleById.get(String(row.personId))?.givenName ?? ""} ${peopleById.get(String(row.personId))?.familyName ?? ""}`.trim(),
            role: peopleById.get(String(row.personId))?.role ?? "",
            event: row.eventId
              ? (eventsById.get(String(row.eventId)) ?? "")
              : "",
            regularHours: row.regularMinutes / 60,
            overtimeHours: row.overtimeMinutes / 60,
            earnings: Number(row.grossAmount ?? 0),
            status: row.status,
          },
        }));
      return financial(
        args.reportId,
        [
          { key: "staff", label: "Staff member", kind: "text" },
          { key: "role", label: "Title", kind: "text" },
          { key: "event", label: "Event", kind: "text" },
          { key: "regularHours", label: "Regular hours", kind: "number" },
          { key: "overtimeHours", label: "Overtime hours", kind: "number" },
          { key: "earnings", label: "Earnings", kind: "money" },
          { key: "status", label: "Status", kind: "text" },
        ],
        rows,
        [moneyTotal(rows, "earnings", "Staff earnings")],
      );
    }

    const lineReportIds = new Set([
      "beverage-costs",
      "beverage-totals",
      "event-discount-summary",
      "event-other-fees",
      "ledger-food-beverage-sales",
      "menu-item-cost-per-event",
      "menu-item-costing",
      "menu-item-itemized-sales",
      "menu-item-sales-by-category",
      "miscellaneous-totals",
      "platform-fee-gratuity-summary",
      "rental-charges",
      "staffing-charges",
      "tax-exempt-new",
      "taxable-sales",
    ]);
    if (lineReportIds.has(args.reportId)) {
      const matcher = args.reportId.includes("beverage")
        ? /beverage|drink|bar|wine|beer/i
        : args.reportId.includes("rental")
          ? /rental|equipment/i
          : args.reportId.includes("staff")
            ? /staff|labor/i
            : args.reportId.includes("miscellaneous")
              ? /misc|other/i
              : args.reportId.includes("platform-fee")
                ? /platform|gratuity|tip/i
                : args.reportId === "event-other-fees"
                  ? /other fee|service fee|delivery fee|fee/i
                  : null;
      let rows = rangedInvoices.flatMap((invoice) =>
        invoiceLines(invoice.lineItems).map((line, index) => ({
          id: `${invoice._id}-${index}`,
          values: {
            event: invoice.eventId
              ? (eventById.get(String(invoice.eventId))?.title ?? "")
              : "",
            contact: clientName(clientById.get(String(invoice.clientId))),
            invoice: invoice.invoiceNumber ?? "",
            date: invoice.issuedAt ?? null,
            item: line.description,
            category: line.category,
            quantity: line.quantity,
            sales: line.amount,
            cost: line.cost,
            profit: line.amount - line.cost,
            margin: percent(line.amount - line.cost, line.amount),
            tax: line.tax,
            discount: invoice.discountAmount,
            total: line.amount + line.tax,
          },
        })),
      );
      if (matcher)
        rows = rows.filter(
          (row) =>
            matcher.test(String(row.values.category)) ||
            matcher.test(String(row.values.item)),
        );
      if (args.reportId === "event-discount-summary")
        rows = rangedInvoices
          .filter((invoice) => invoice.discountAmount !== 0)
          .map((invoice) => ({
            id: invoice._id,
            values: {
              event: invoice.eventId
                ? (eventById.get(String(invoice.eventId))?.title ?? "")
                : "",
              contact: clientName(clientById.get(String(invoice.clientId))),
              invoice: invoice.invoiceNumber ?? "",
              date: invoice.issuedAt ?? null,
              item: "Discount",
              category: "discount",
              quantity: 1,
              sales: invoice.subtotal,
              cost: 0,
              profit: invoice.subtotal - invoice.discountAmount,
              margin: percent(
                invoice.subtotal - invoice.discountAmount,
                invoice.subtotal,
              ),
              tax: invoice.taxAmount,
              discount: invoice.discountAmount,
              total: invoice.total,
            },
          }));
      if (args.reportId === "tax-exempt-new") {
        rows = rows.filter((row) => Number(row.values.tax) === 0);
      }
      if (args.reportId === "taxable-sales") {
        rows = rows.filter((row) => Number(row.values.tax) !== 0);
      }
      return financial(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "invoice", label: "Invoice", kind: "text" },
          { key: "date", label: "Date", kind: "date" },
          { key: "item", label: "Item", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
          { key: "quantity", label: "Quantity", kind: "quantity" },
          { key: "sales", label: "Sales", kind: "money" },
          { key: "cost", label: "Cost", kind: "money" },
          { key: "profit", label: "Profit", kind: "money" },
          { key: "margin", label: "Profit %", kind: "number" },
          { key: "tax", label: "Tax", kind: "money" },
          { key: "discount", label: "Discount", kind: "money" },
          { key: "total", label: "Total", kind: "money" },
        ],
        rows,
        [
          moneyTotal(rows, "sales", "Sales"),
          moneyTotal(rows, "cost", "Cost"),
          moneyTotal(rows, "profit", "Profit"),
          moneyTotal(rows, "tax", "Tax"),
          moneyTotal(rows, "discount", "Discounts"),
          moneyTotal(rows, "total", "Total"),
        ],
      );
    }

    if (args.reportId === "lost-revenue-by-cancellation-reason") {
      const rows = events
        .filter(
          (row) =>
            isLiveTenantRow(row, tenantId) &&
            row.stage === "cancelled" &&
            inDateRange(row.startsAt, start, end),
        )
        .map((row) => ({
          id: row._id,
          values: {
            event: row.title,
            date: row.startsAt ?? null,
            contact: row.primaryContactName ?? "",
            reason: row.cancellationReason ?? "Not specified",
            revenue: row.quotedPrice,
          },
        }));
      return financial(
        args.reportId,
        [
          { key: "event", label: "Event", kind: "text" },
          { key: "date", label: "Date", kind: "date" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "reason", label: "Cancellation reason", kind: "text" },
          { key: "revenue", label: "Lost revenue", kind: "money" },
        ],
        rows,
        [moneyTotal(rows, "revenue", "Lost revenue")],
      );
    }

    const revenueRows: TppRow[] = rangedInvoices.map((invoice) => {
      const event = invoice.eventId
        ? eventById.get(String(invoice.eventId))
        : undefined;
      return {
        id: invoice._id,
        values: {
          date: invoice.issuedAt ?? event?.startsAt ?? null,
          event: event?.title ?? "",
          contact: clientName(clientById.get(String(invoice.clientId))),
          venue: event?.venueName ?? "",
          referral: event?.referralSourceId
            ? String(event.referralSourceId)
            : "Unassigned",
          guests: event?.expectedHeadcount ?? 0,
          subtotal: invoice.subtotal,
          tax: invoice.taxAmount,
          discount: invoice.discountAmount,
          revenue: invoice.total,
          paid: invoice.amountPaid,
          balance: invoice.amountDue,
          perGuest: event?.expectedHeadcount
            ? invoice.total / event.expectedHeadcount
            : 0,
          status: invoice.status,
        },
      };
    });
    if (args.reportId === "snapshot-revenue") {
      const asOf = Number(parameters.asOf ?? Date.now());
      revenueRows.splice(
        0,
        revenueRows.length,
        ...billed
          .filter((row) => (row.issuedAt ?? row.createdAt ?? 0) <= asOf)
          .map((invoice) => {
            const event = invoice.eventId
              ? eventById.get(String(invoice.eventId))
              : undefined;
            return {
              id: invoice._id,
              values: {
                date: invoice.issuedAt ?? null,
                event: event?.title ?? "",
                contact: clientName(clientById.get(String(invoice.clientId))),
                venue: event?.venueName ?? "",
                referral: event?.referralSourceId
                  ? String(event.referralSourceId)
                  : "Unassigned",
                guests: event?.expectedHeadcount ?? 0,
                subtotal: invoice.subtotal,
                tax: invoice.taxAmount,
                discount: invoice.discountAmount,
                revenue: invoice.total,
                paid: invoice.amountPaid,
                balance: invoice.amountDue,
                perGuest: event?.expectedHeadcount
                  ? invoice.total / event.expectedHeadcount
                  : 0,
                status: invoice.status,
              },
            };
          }),
      );
    }
    if (args.reportId === "sales-forecasting") {
      revenueRows.push(
        ...events
          .filter(
            (event) =>
              isLiveTenantRow(event, tenantId) &&
              !["cancelled", "closed_out"].includes(event.stage) &&
              inDateRange(event.startsAt, start, end) &&
              !rangedInvoices.some((invoice) => invoice.eventId === event._id),
          )
          .map((event) => ({
            id: event._id,
            values: {
              date: event.startsAt ?? null,
              event: event.title,
              contact: event.primaryContactName ?? "",
              venue: event.venueName ?? "",
              referral: event.referralSourceId
                ? String(event.referralSourceId)
                : "Unassigned",
              guests: event.expectedHeadcount,
              subtotal: event.quotedPrice,
              tax: 0,
              discount: 0,
              revenue: event.quotedPrice,
              paid: 0,
              balance: event.quotedPrice,
              perGuest: event.expectedHeadcount
                ? event.quotedPrice / event.expectedHeadcount
                : 0,
              status: "forecast",
            },
          })),
      );
    }
    const supportedRevenue = new Set([
      "average-event-spending-per-guest",
      "event-revenue-by-client",
      "event-sales-by-referral",
      "event-scheduled-payments",
      "sales-forecasting",
      "snapshot-revenue",
      "taxable-sales",
      "venue-sales",
    ]);
    if (supportedRevenue.has(args.reportId)) {
      return financial(
        args.reportId,
        [
          { key: "date", label: "Date", kind: "date" },
          { key: "event", label: "Event", kind: "text" },
          { key: "contact", label: "Contact", kind: "text" },
          { key: "venue", label: "Venue", kind: "text" },
          { key: "referral", label: "Referral", kind: "text" },
          { key: "guests", label: "Guests", kind: "number" },
          { key: "subtotal", label: "Subtotal", kind: "money" },
          { key: "tax", label: "Tax", kind: "money" },
          { key: "discount", label: "Discount", kind: "money" },
          { key: "revenue", label: "Revenue", kind: "money" },
          { key: "paid", label: "Paid", kind: "money" },
          { key: "balance", label: "Balance", kind: "money" },
          { key: "perGuest", label: "Per guest", kind: "money" },
          { key: "status", label: "Status", kind: "text" },
        ],
        revenueRows,
        [
          moneyTotal(revenueRows, "revenue", "Revenue"),
          moneyTotal(revenueRows, "paid", "Paid"),
          moneyTotal(revenueRows, "balance", "Balance"),
        ],
      );
    }
    throw new Error(`No Financial resolver for ${args.reportId}`);
  },
});
