export type RevenueGranularity = "week" | "month" | "quarter";
export type RevenueBreakdown = "event_type" | "client" | "service_line";

type DateValue = Date | number | string | null | undefined;

export type RevenueInvoice = {
  _id?: string;
  clientId?: string | null;
  eventId?: string | null;
  total?: number | null;
  status?: string | null;
  issuedAt?: DateValue;
  createdAt?: DateValue;
  deletedAt?: DateValue;
};

export type RevenueClient = {
  _id: string;
  clientType?: string | null;
  displayName?: string | null;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
};

export type RevenueEvent = {
  _id: string;
  eventType?: string | null;
};

export type RevenuePeriod = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  currentTotal: number;
  priorTotal: number;
  currentByCategory: Record<string, number>;
  priorByCategory: Record<string, number>;
};

export type RevenueCategory = {
  key: string;
  label: string;
  currentTotal: number;
  priorTotal: number;
};

export type RevenueTrend = {
  periods: RevenuePeriod[];
  categories: RevenueCategory[];
  currentTotal: number;
  priorTotal: number;
  currentInvoiceCount: number;
  changePercent: number | null;
  rangeStart: Date;
  rangeEnd: Date;
};

const PERIOD_COUNT: Record<RevenueGranularity, number> = {
  week: 13,
  month: 12,
  quarter: 8,
};

function validDate(value: DateValue): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfPeriod(date: Date, granularity: RevenueGranularity): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    return start;
  }
  start.setDate(1);
  if (granularity === "quarter") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3);
  }
  return start;
}

function shiftPeriod(
  date: Date,
  amount: number,
  granularity: RevenueGranularity,
): Date {
  const shifted = new Date(date);
  if (granularity === "week") shifted.setDate(shifted.getDate() + amount * 7);
  if (granularity === "month") shifted.setMonth(shifted.getMonth() + amount);
  if (granularity === "quarter") {
    shifted.setMonth(shifted.getMonth() + amount * 3);
  }
  return shifted;
}

function priorYearPeriod(date: Date, granularity: RevenueGranularity): Date {
  const prior = new Date(date);
  if (granularity === "week") {
    prior.setDate(prior.getDate() - 52 * 7);
  } else {
    prior.setFullYear(prior.getFullYear() - 1);
  }
  return prior;
}

function periodLabel(date: Date, granularity: RevenueGranularity): string {
  if (granularity === "week") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  }
  return `Q${Math.floor(date.getMonth() / 3) + 1} ’${String(date.getFullYear()).slice(-2)}`;
}

function clientLabel(client: RevenueClient | undefined): string {
  if (!client) return "Unknown client";
  if (client.displayName?.trim()) return client.displayName.trim();
  if (client.clientType === "person") {
    const personName = [client.givenName, client.familyName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (personName) return personName;
  }
  return client.companyName?.trim() || "Unnamed client";
}

function categoryFor(
  invoice: RevenueInvoice,
  breakdown: RevenueBreakdown,
  clientsById: ReadonlyMap<string, RevenueClient>,
  eventsById: ReadonlyMap<string, RevenueEvent>,
): { key: string; label: string } {
  if (breakdown === "service_line") {
    return { key: "catering-services", label: "Catering services" };
  }
  if (breakdown === "client") {
    const key = String(invoice.clientId || "unknown-client");
    return { key, label: clientLabel(clientsById.get(key)) };
  }
  if (!invoice.eventId) {
    return { key: "unlinked", label: "Unlinked invoices" };
  }
  const event = eventsById.get(String(invoice.eventId));
  const label = event?.eventType?.trim() || "Unclassified event";
  return { key: `event-type:${label}`, label };
}

export function buildRevenueTrend({
  invoices,
  clients,
  events,
  granularity,
  breakdown,
  now = new Date(),
}: {
  invoices: readonly RevenueInvoice[];
  clients: readonly RevenueClient[];
  events: readonly RevenueEvent[];
  granularity: RevenueGranularity;
  breakdown: RevenueBreakdown;
  now?: Date;
}): RevenueTrend {
  const clientsById = new Map(clients.map((row) => [String(row._id), row]));
  const eventsById = new Map(events.map((row) => [String(row._id), row]));
  const periodCount = PERIOD_COUNT[granularity];
  const finalStart = startOfPeriod(now, granularity);
  const rangeStart = shiftPeriod(finalStart, -(periodCount - 1), granularity);
  const rangeEnd = shiftPeriod(finalStart, 1, granularity);
  const categoryLabels = new Map<string, string>();

  const periods: RevenuePeriod[] = Array.from(
    { length: periodCount },
    (_, index) => {
      const start = shiftPeriod(rangeStart, index, granularity);
      return {
        key: start.toISOString(),
        label: periodLabel(start, granularity),
        start,
        end: shiftPeriod(start, 1, granularity),
        currentTotal: 0,
        priorTotal: 0,
        currentByCategory: {},
        priorByCategory: {},
      };
    },
  );

  let currentInvoiceCount = 0;
  for (const invoice of invoices) {
    if (
      invoice.deletedAt != null ||
      ["voided", "written_off"].includes(String(invoice.status))
    ) {
      continue;
    }
    const issuedAt = validDate(invoice.issuedAt ?? invoice.createdAt);
    const total = Number(invoice.total ?? 0);
    if (!issuedAt || !Number.isFinite(total)) continue;
    const category = categoryFor(invoice, breakdown, clientsById, eventsById);
    categoryLabels.set(category.key, category.label);

    for (const period of periods) {
      const currentTime = issuedAt.getTime();
      if (
        currentTime >= period.start.getTime() &&
        currentTime < period.end.getTime()
      ) {
        period.currentTotal += total;
        period.currentByCategory[category.key] =
          (period.currentByCategory[category.key] ?? 0) + total;
        currentInvoiceCount += 1;
        break;
      }
      const priorStart = priorYearPeriod(period.start, granularity);
      const priorEnd = priorYearPeriod(period.end, granularity);
      if (
        currentTime >= priorStart.getTime() &&
        currentTime < priorEnd.getTime()
      ) {
        period.priorTotal += total;
        period.priorByCategory[category.key] =
          (period.priorByCategory[category.key] ?? 0) + total;
        break;
      }
    }
  }

  const categoryTotals = new Map<
    string,
    { currentTotal: number; priorTotal: number }
  >();
  for (const period of periods) {
    for (const [key, value] of Object.entries(period.currentByCategory)) {
      const totals = categoryTotals.get(key) ?? {
        currentTotal: 0,
        priorTotal: 0,
      };
      totals.currentTotal += value;
      categoryTotals.set(key, totals);
    }
    for (const [key, value] of Object.entries(period.priorByCategory)) {
      const totals = categoryTotals.get(key) ?? {
        currentTotal: 0,
        priorTotal: 0,
      };
      totals.priorTotal += value;
      categoryTotals.set(key, totals);
    }
  }

  const categories = [...categoryTotals.entries()]
    .map(([key, totals]) => ({
      key,
      label: categoryLabels.get(key) ?? key,
      ...totals,
    }))
    .sort(
      (a, b) => b.currentTotal + b.priorTotal - (a.currentTotal + a.priorTotal),
    );
  const currentTotal = periods.reduce(
    (sum, period) => sum + period.currentTotal,
    0,
  );
  const priorTotal = periods.reduce(
    (sum, period) => sum + period.priorTotal,
    0,
  );

  return {
    periods,
    categories,
    currentTotal,
    priorTotal,
    currentInvoiceCount,
    changePercent:
      priorTotal === 0
        ? null
        : ((currentTotal - priorTotal) / priorTotal) * 100,
    rangeStart,
    rangeEnd,
  };
}
