// AUTHOR SEAM — what each staff email summary says (PL-ROUTE-STATES, AC-054
// sweep task "staff email summaries"). Pure: the sender reads the rows, this
// file turns them into the words of one summary, or null when there is
// nothing to tell (no email goes then).
import type { EmailNotificationCategory } from "../../src/lib/emailNotifications";

export interface SummaryContent {
  category: EmailNotificationCategory;
  title: string;
  summary: string;
  actionLabel: string;
  deepLinkPath: string;
  items: Array<{ label: string; value: string }>;
}

const MAX_ITEMS = 8;

function dayText(at: number, timeZone: string | null): string {
  try {
    return new Date(at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : { timeZone: "UTC" }),
    });
  } catch {
    return new Date(at).toUTCString();
  }
}

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const STAGE_WORDS: Record<string, string> = {
  quote: "Quote",
  planning: "Planning",
  pending_approval: "Waiting for approval",
  approved: "Approved",
  sales_lock: "Sales lock",
  executing: "In progress",
  final: "Final",
  completed: "Completed",
  cancelled: "Cancelled",
  closed_out: "Closed out",
};

export function eventUpdatesSummary(
  events: Array<{
    title: string;
    stage: string;
    startsAt?: number | null;
    updatedAt?: number;
  }>,
  timeZone: string | null,
): SummaryContent | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort(
    (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
  );
  return {
    category: "event_updates",
    title: `${plural(events.length, "event", "events")} changed since yesterday`,
    summary:
      events.length > MAX_ITEMS
        ? `The ${MAX_ITEMS} most recent changes are below. Open Capsule to see the rest.`
        : "These events were changed in the last day.",
    actionLabel: "Open events",
    deepLinkPath: "/events",
    items: sorted.slice(0, MAX_ITEMS).map((event) => ({
      label: event.title,
      value: [
        STAGE_WORDS[event.stage] ?? event.stage,
        event.startsAt ? dayText(event.startsAt, timeZone) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}

export function invoiceFollowUpSummary(
  invoices: Array<{
    invoiceNumber?: string | null;
    amountDue: number;
    dueDate: number;
  }>,
  now: number,
  timeZone: string | null,
): SummaryContent | null {
  if (invoices.length === 0) return null;
  const sorted = [...invoices].sort(
    (left, right) => left.dueDate - right.dueDate,
  );
  const overdue = invoices.filter((invoice) => invoice.dueDate < now).length;
  return {
    category: "invoice_reminders",
    title:
      overdue > 0
        ? `${plural(overdue, "invoice is", "invoices are")} past due`
        : `${plural(invoices.length, "invoice is", "invoices are")} due soon`,
    summary:
      "These invoices still have money owed and are past due or due in the next 3 days.",
    actionLabel: "Open invoices",
    deepLinkPath: "/finance/invoices",
    items: sorted.slice(0, MAX_ITEMS).map((invoice) => ({
      label: `Invoice ${invoice.invoiceNumber || "with no number"}`,
      value: `${usd(invoice.amountDue)} · ${
        invoice.dueDate < now ? "was due" : "due"
      } ${dayText(invoice.dueDate, timeZone)}`,
    })),
  };
}

export function lowStockSummary(
  items: Array<{ name: string; quantityOnHand: number; unit: string }>,
): SummaryContent | null {
  if (items.length === 0) return null;
  return {
    category: "low_stock_alerts",
    title: `${plural(items.length, "item is", "items are")} at or below the reorder level`,
    summary: "Check these before the next order goes out.",
    actionLabel: "Open stock",
    deepLinkPath: "/inventory/stock",
    items: [...items]
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_ITEMS)
      .map((item) => ({
        label: item.name,
        value: `${Number(item.quantityOnHand.toFixed(2))} ${item.unit.replaceAll("_", " ")} left`,
      })),
  };
}

export function shiftChangesSummary(
  shifts: Array<{
    startsAt: number;
    role?: string | null;
    eventTitle?: string | null;
    status: string;
  }>,
  timeZone: string | null,
): SummaryContent | null {
  if (shifts.length === 0) return null;
  return {
    category: "shift_changes",
    title: `${plural(shifts.length, "of your shifts", "of your shifts")} changed`,
    summary:
      "Your schedule changed in the last day. Check the times before you come in.",
    actionLabel: "Open My Day",
    deepLinkPath: "/my",
    items: [...shifts]
      .sort((left, right) => left.startsAt - right.startsAt)
      .slice(0, MAX_ITEMS)
      .map((shift) => ({
        label: dayText(shift.startsAt, timeZone),
        value:
          shift.status === "cancelled"
            ? "Cancelled"
            : [shift.role, shift.eventTitle].filter(Boolean).join(" · ") ||
              "Shift",
      })),
  };
}

/**
 * The next 7 in the morning in the kitchen's time zone (no zone: 12:00 UTC,
 * about 7 or 8 am on the US east coast). Never `now` itself.
 */
export function nextMorningRun(now: number, timeZone: string | null): number {
  const RUN_HOUR = 7;
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(new Date(now));
      const hour = Number(parts.find((part) => part.type === "hour")?.value);
      const minute = Number(
        parts.find((part) => part.type === "minute")?.value,
      );
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const minutesNow = hour * 60 + minute;
        const until =
          (RUN_HOUR * 60 - minutesNow + 24 * 60) % (24 * 60) || 24 * 60;
        return now + until * 60_000;
      }
    } catch {
      // Unknown zone: fall through to UTC.
    }
  }
  const next = new Date(now);
  next.setUTCHours(12, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}
