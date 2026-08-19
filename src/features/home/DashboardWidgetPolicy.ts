import { formatDate, formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  catalogUnitForStockLine,
  isBelowReorder,
  stockLineLink,
} from "../inventory/stockLevels";
import {
  vendorOrderHeaderTotal,
  type VendorOrderMoneySource,
} from "../inventory/vendorOrderTotals";

export const DASHBOARD_WIDGET_IDS = [
  "upcoming_events",
  "invoice_aging",
  "low_stock_alerts",
  "staff_schedule_gaps",
  "recent_activity",
  "cash_forecast",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetId[] = [
  "upcoming_events",
  "invoice_aging",
  "low_stock_alerts",
  "staff_schedule_gaps",
];

export interface DashboardWidgetCatalogItem {
  id: DashboardWidgetId;
  title: string;
  description: string;
  eyebrow: string;
  href: string;
  tone: "brand" | "accent" | "warn" | "info" | "ok" | "ink";
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetCatalogItem[] = [
  {
    id: "upcoming_events",
    title: "Upcoming events",
    description: "The next live services by start time.",
    eyebrow: "Run of show",
    href: "/events",
    tone: "brand",
  },
  {
    id: "invoice_aging",
    title: "Invoice aging",
    description: "Outstanding receivables grouped by age.",
    eyebrow: "Receivables",
    href: "/finance/invoices",
    tone: "accent",
  },
  {
    id: "low_stock_alerts",
    title: "Low-stock alerts",
    description: "Inventory below its reorder point.",
    eyebrow: "Stock watch",
    href: "/inventory/stock",
    tone: "warn",
  },
  {
    id: "staff_schedule_gaps",
    title: "Staff schedule gaps",
    description: "Upcoming services missing people or times.",
    eyebrow: "Coverage desk",
    href: "/staff/roster",
    tone: "info",
  },
  {
    id: "recent_activity",
    title: "Recent activity",
    description: "The latest changes across your business.",
    eyebrow: "What's new",
    href: "/reports",
    tone: "ink",
  },
  {
    id: "cash_forecast",
    title: "Cash forecast",
    description: "30-day receivables less committed open orders.",
    eyebrow: "Near-term position",
    href: "/finance/invoices",
    tone: "ok",
  },
];

export interface DashboardWidgetRow {
  label: string;
  value?: string;
  meta?: string;
  href?: string;
}

export interface DashboardWidgetView extends DashboardWidgetCatalogItem {
  metric: string;
  metricLabel: string;
  rows: DashboardWidgetRow[];
  emptyMessage?: string;
}

type BaseRow = {
  _id: string;
  deletedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
};

type EventRow = BaseRow & {
  title?: string | null;
  startsAt?: number | null;
  stage?: string | null;
};

type InvoiceRow = BaseRow & {
  invoiceNumber?: string | null;
  amountDue?: number | null;
  dueDate?: number | null;
  status?: string | null;
};

type InventoryRow = BaseRow & {
  ingredientId?: string | null;
  quantityOnHand?: number | null;
  reorderThreshold?: number | null;
  unit?: string | null;
};

type IngredientRow = BaseRow & { name?: string | null; unit?: string | null };

type AssignmentRow = BaseRow & {
  eventId?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  status?: string | null;
  role?: string | null;
};

type PaymentRow = BaseRow & {
  amount?: number | null;
  status?: string | null;
  recordedAt?: number | null;
};

type VendorOrderRow = BaseRow &
  VendorOrderMoneySource & {
    orderNumber?: string | null;
    status?: string | null;
  };

export interface DashboardFacts {
  nowMs?: number;
  events: readonly EventRow[];
  invoices: readonly InvoiceRow[];
  inventoryItems: readonly InventoryRow[];
  ingredients: readonly IngredientRow[];
  assignments: readonly AssignmentRow[];
  payments: readonly PaymentRow[];
  vendorOrders: readonly VendorOrderRow[];
}

const DAY_MS = 86_400_000;
const ACTIVE_EVENT_STAGES = new Set([
  "planning",
  "pending_approval",
  "approved",
  "executing",
  "completed",
]);
const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);
const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  "assigned",
  "confirmed",
  "checked_in",
]);
const COMMITTED_ORDER_STATUSES = new Set([
  "submitted",
  "confirmed",
  "partially_received",
]);

function active<T extends BaseRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deletedAt == null);
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rowTimestamp(row: BaseRow): number {
  return number(row.updatedAt) || number(row.createdAt);
}

function relativeTime(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function normalizeDashboardPins(value: unknown): DashboardWidgetId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(DASHBOARD_WIDGET_IDS);
  return [
    ...new Set(value.filter((item) => allowed.has(String(item))).map(String)),
  ].slice(0, 6) as DashboardWidgetId[];
}

export class DashboardWidgetPolicy {
  build(facts: DashboardFacts): Record<DashboardWidgetId, DashboardWidgetView> {
    const now = facts.nowMs ?? Date.now();
    const catalog = new Map(
      DASHBOARD_WIDGET_CATALOG.map((item) => [item.id, item]),
    );
    const events = active(facts.events);
    const invoices = active(facts.invoices);
    const inventory = active(facts.inventoryItems);
    const assignments = active(facts.assignments);
    const payments = active(facts.payments);
    const vendorOrders = active(facts.vendorOrders);
    const ingredientsById = new Map(
      active(facts.ingredients).map((row) => [
        row._id,
        row.name || "Ingredient",
      ]),
    );
    const eventsById = new Map(events.map((row) => [row._id, row]));

    const upcoming = events
      .filter(
        (event) =>
          ACTIVE_EVENT_STAGES.has(String(event.stage)) &&
          event.startsAt != null &&
          event.startsAt >= now,
      )
      .sort((a, b) => number(a.startsAt) - number(b.startsAt));

    const openInvoices = invoices.filter(
      (invoice) =>
        OPEN_INVOICE_STATUSES.has(String(invoice.status)) &&
        number(invoice.amountDue) > 0,
    );
    const overdueInvoices = openInvoices.filter(
      (invoice) =>
        invoice.status === "overdue" ||
        (invoice.dueDate != null && invoice.dueDate < now),
    );
    const agingBuckets = [0, 0, 0, 0];
    for (const invoice of openInvoices) {
      if (invoice.dueDate == null || invoice.dueDate >= now) {
        agingBuckets[0] += number(invoice.amountDue);
        continue;
      }
      const age = Math.floor((now - invoice.dueDate) / DAY_MS);
      if (age <= 30) agingBuckets[1] += number(invoice.amountDue);
      else if (age <= 60) agingBuckets[2] += number(invoice.amountDue);
      else agingBuckets[3] += number(invoice.amountDue);
    }

    const lowStock = inventory
      .filter((item) =>
        isBelowReorder({
          quantityOnHand: number(item.quantityOnHand),
          reorderThreshold: number(item.reorderThreshold),
        }),
      )
      .sort(
        (a, b) =>
          number(a.quantityOnHand) / Math.max(1, number(a.reorderThreshold)) -
          number(b.quantityOnHand) / Math.max(1, number(b.reorderThreshold)),
      );

    const coverageWindow = upcoming.filter(
      (event) => number(event.startsAt) <= now + 14 * DAY_MS,
    );
    const activeAssignmentsByEvent = new Map<string, AssignmentRow[]>();
    for (const assignment of assignments) {
      if (!ACTIVE_ASSIGNMENT_STATUSES.has(String(assignment.status))) continue;
      const eventId = String(assignment.eventId ?? "");
      if (!eventId) continue;
      const rows = activeAssignmentsByEvent.get(eventId) ?? [];
      rows.push(assignment);
      activeAssignmentsByEvent.set(eventId, rows);
    }
    const coverageGaps = coverageWindow.flatMap((event) => {
      const rows = activeAssignmentsByEvent.get(event._id) ?? [];
      const incompleteTimes = rows.filter(
        (row) => row.startsAt == null || row.endsAt == null,
      ).length;
      if (rows.length > 0 && incompleteTimes === 0) return [];
      return [{ event, assigned: rows.length, incompleteTimes }];
    });

    const activity = [
      ...events.map((row) => ({
        timestamp: rowTimestamp(row),
        label: row.title || "Untitled event",
        meta: `Event · ${formatStatusLabel(String(row.stage ?? "updated"))}`,
        href: `/events/${row._id}`,
      })),
      ...invoices.map((row) => ({
        timestamp: rowTimestamp(row),
        label: row.invoiceNumber || "Invoice",
        meta: `Invoice · ${formatStatusLabel(String(row.status ?? "updated"))}`,
        href: `/finance/invoices/${row._id}`,
      })),
      ...inventory.map((row) => ({
        timestamp: rowTimestamp(row),
        label:
          ingredientsById.get(String(row.ingredientId)) || "Inventory item",
        meta: "Stock level updated",
        href: "/inventory/stock",
      })),
      ...assignments.map((row) => ({
        timestamp: rowTimestamp(row),
        label: eventsById.get(String(row.eventId))?.title || "Staff assignment",
        meta: `Staff · ${formatStatusLabel(String(row.status ?? "updated"))}`,
        href: "/staff/roster",
      })),
      ...payments.map((row) => ({
        timestamp: rowTimestamp(row) || number(row.recordedAt),
        label: `${formatMoney(number(row.amount))} payment`,
        meta: String(row.status ?? "recorded").replaceAll("_", " "),
        href: "/finance/payments",
      })),
    ]
      .filter((item) => item.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    const receivables30 = openInvoices
      .filter(
        (invoice) =>
          invoice.dueDate == null || invoice.dueDate <= now + 30 * DAY_MS,
      )
      .reduce((sum, invoice) => sum + number(invoice.amountDue), 0);
    const committedOrders = vendorOrders
      .filter((order) => COMMITTED_ORDER_STATUSES.has(String(order.status)))
      .reduce((sum, order) => sum + vendorOrderHeaderTotal(order), 0);
    const netCash = receivables30 - committedOrders;

    const get = (id: DashboardWidgetId) => catalog.get(id)!;
    return {
      upcoming_events: {
        ...get("upcoming_events"),
        metric: String(upcoming.length),
        metricLabel:
          upcoming.length === 1 ? "future service" : "future services",
        rows: upcoming.slice(0, 4).map((event) => ({
          label: event.title || "Untitled event",
          value: formatDate(event.startsAt),
          meta: String(event.stage ?? "planning").replaceAll("_", " "),
          href: `/events/${event._id}`,
        })),
        emptyMessage: "No future services are scheduled.",
      },
      invoice_aging: {
        ...get("invoice_aging"),
        metric: formatMoney(
          overdueInvoices.reduce(
            (sum, invoice) => sum + number(invoice.amountDue),
            0,
          ),
        ),
        metricLabel: `${overdueInvoices.length} overdue ${overdueInvoices.length === 1 ? "invoice" : "invoices"}`,
        rows: [
          { label: "Current", value: formatMoney(agingBuckets[0]) },
          { label: "1–30 days", value: formatMoney(agingBuckets[1]) },
          { label: "31–60 days", value: formatMoney(agingBuckets[2]) },
          { label: "61+ days", value: formatMoney(agingBuckets[3]) },
        ],
      },
      low_stock_alerts: {
        ...get("low_stock_alerts"),
        metric: String(lowStock.length),
        metricLabel:
          lowStock.length === 1 ? "item below reorder" : "items below reorder",
        rows: lowStock.slice(0, 4).map((item) => ({
          label:
            ingredientsById.get(String(item.ingredientId)) || "Inventory item",
          value: `${number(item.quantityOnHand)} / ${number(item.reorderThreshold)}`,
          meta: catalogUnitForStockLine(item, facts.ingredients),
          href: stockLineLink(item._id),
        })),
        emptyMessage:
          "Every tracked stock line is at or above its reorder point.",
      },
      staff_schedule_gaps: {
        ...get("staff_schedule_gaps"),
        metric: String(coverageGaps.length),
        metricLabel: "services need coverage",
        rows: coverageGaps
          .slice(0, 4)
          .map(({ event, assigned, incompleteTimes }) => ({
            label: event.title || "Untitled event",
            value: assigned === 0 ? "No crew" : `${incompleteTimes} incomplete`,
            meta: formatDate(event.startsAt),
            href: `/events/${event._id}`,
          })),
        emptyMessage:
          "Upcoming services have assigned people and complete times.",
      },
      recent_activity: {
        ...get("recent_activity"),
        metric: String(activity.length),
        metricLabel: "recent updates",
        rows: activity.map((item) => ({
          label: item.label,
          value: relativeTime(item.timestamp, now),
          meta: item.meta,
          href: item.href,
        })),
        emptyMessage: "Nothing new just yet.",
      },
      cash_forecast: {
        ...get("cash_forecast"),
        metric: formatMoney(netCash),
        metricLabel: "net expected position",
        rows: [
          {
            label: "Receivables, next 30 days",
            value: formatMoney(receivables30),
          },
          {
            label: "Committed open orders",
            value: formatMoney(committedOrders),
          },
          {
            label: "Overdue receivables",
            value: formatMoney(
              agingBuckets[1] + agingBuckets[2] + agingBuckets[3],
            ),
          },
        ],
      },
    };
  }
}
