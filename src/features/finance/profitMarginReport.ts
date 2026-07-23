export type ProfitMarginGranularity = "month" | "quarter";
export type ProfitMarginView = "event" | "client" | "period";

type DateValue = Date | number | string | null | undefined;

export type ProfitMarginEvent = {
  _id: string;
  clientId?: string | null;
  title?: string | null;
  eventType?: string | null;
  startsAt?: DateValue;
  deletedAt?: DateValue;
};

export type ProfitMarginClient = {
  _id: string;
  clientType?: string | null;
  displayName?: string | null;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  deletedAt?: DateValue;
};

export type ProfitMarginCloseout = {
  _id?: string;
  eventId: string;
  status?: string | null;
  actualRevenue?: number | null;
  actualIngredientCost?: number | null;
  actualLaborCost?: number | null;
  actualVendorCost?: number | null;
  actualWasteCost?: number | null;
  capturedAt?: DateValue;
  finalizedAt?: DateValue;
  deletedAt?: DateValue;
};

export type ProfitMetrics = {
  revenue: number;
  foodCost: number;
  laborCost: number;
  equipmentCost: number;
  overheadCost: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  netProfit: number;
  netMarginPercent: number | null;
  eventCount: number;
};

export type ProfitMarginEventRow = ProfitMetrics & {
  key: string;
  eventId: string;
  clientId: string;
  title: string;
  clientName: string;
  segmentKey: string;
  segmentLabel: string;
  eventType: string;
  date: Date;
};

export type ProfitMarginClientRow = ProfitMetrics & {
  key: string;
  clientId: string;
  clientName: string;
  segmentKey: string;
  segmentLabel: string;
};

export type ProfitMarginPeriodRow = ProfitMetrics & {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

export type ProfitMarginSegmentRow = ProfitMetrics & {
  key: string;
  label: string;
};

export type ProfitMarginReport = {
  summary: ProfitMetrics;
  events: ProfitMarginEventRow[];
  clients: ProfitMarginClientRow[];
  periods: ProfitMarginPeriodRow[];
  segments: ProfitMarginSegmentRow[];
  bestSegment: ProfitMarginSegmentRow | null;
  weakestSegment: ProfitMarginSegmentRow | null;
  rangeStart: Date;
  rangeEnd: Date;
  excludedCloseoutCount: number;
};

type MutableMetrics = {
  revenue: number;
  foodCost: number;
  laborCost: number;
  equipmentCost: number;
  overheadCost: number;
  eventCount: number;
};

const EMPTY_METRICS: MutableMetrics = {
  revenue: 0,
  foodCost: 0,
  laborCost: 0,
  equipmentCost: 0,
  overheadCost: 0,
  eventCount: 0,
};

function amount(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function validDate(value: DateValue): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function metricsOf(values: MutableMetrics): ProfitMetrics {
  const totalCost =
    values.foodCost +
    values.laborCost +
    values.equipmentCost +
    values.overheadCost;
  const grossProfit = values.revenue - values.foodCost;
  const netProfit = values.revenue - totalCost;

  return {
    ...values,
    totalCost,
    grossProfit,
    grossMarginPercent:
      values.revenue > 0 ? (grossProfit / values.revenue) * 100 : null,
    netProfit,
    netMarginPercent:
      values.revenue > 0 ? (netProfit / values.revenue) * 100 : null,
  };
}

function addMetrics(target: MutableMetrics, source: ProfitMetrics): void {
  target.revenue += source.revenue;
  target.foodCost += source.foodCost;
  target.laborCost += source.laborCost;
  target.equipmentCost += source.equipmentCost;
  target.overheadCost += source.overheadCost;
  target.eventCount += source.eventCount;
}

function clientName(client: ProfitMarginClient | undefined): string {
  if (!client) return "Unknown client";
  if (client.displayName?.trim()) return client.displayName.trim();
  if (client.clientType === "person") {
    const name = [client.givenName, client.familyName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) return name;
  }
  return client.companyName?.trim() || "Unnamed client";
}

function clientSegment(client: ProfitMarginClient | undefined): {
  key: string;
  label: string;
} {
  if (client?.clientType === "company") {
    return { key: "company", label: "Company clients" };
  }
  if (client?.clientType === "person") {
    return { key: "person", label: "Individual clients" };
  }
  return { key: "unclassified", label: "Unclassified clients" };
}

function startOfPeriod(date: Date, granularity: ProfitMarginGranularity): Date {
  const month =
    granularity === "quarter"
      ? Math.floor(date.getMonth() / 3) * 3
      : date.getMonth();
  return new Date(date.getFullYear(), month, 1);
}

function endOfPeriod(date: Date, granularity: ProfitMarginGranularity): Date {
  const end = new Date(date);
  end.setMonth(end.getMonth() + (granularity === "quarter" ? 3 : 1));
  return end;
}

function periodLabel(date: Date, granularity: ProfitMarginGranularity): string {
  if (granularity === "quarter") {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvMoney(value: number): string {
  return value.toFixed(2);
}

function csvPercent(value: number | null): string {
  return value == null ? "" : value.toFixed(2);
}

function metricsColumns(metrics: ProfitMetrics): Array<string | number> {
  return [
    metrics.eventCount,
    csvMoney(metrics.revenue),
    csvMoney(metrics.foodCost),
    csvMoney(metrics.laborCost),
    csvMoney(metrics.equipmentCost),
    csvMoney(metrics.overheadCost),
    csvMoney(metrics.totalCost),
    csvMoney(metrics.grossProfit),
    csvPercent(metrics.grossMarginPercent),
    csvMoney(metrics.netProfit),
    csvPercent(metrics.netMarginPercent),
  ];
}

const METRIC_HEADERS = [
  "Event count",
  "Revenue",
  "Food cost",
  "Labor cost",
  "Equipment cost",
  "Overhead cost",
  "Total cost",
  "Gross profit",
  "Gross margin percent",
  "Net profit",
  "Net margin percent",
];

export function buildProfitMarginReport({
  closeouts,
  events,
  clients,
  granularity,
  rangeStart,
  rangeEnd,
}: {
  closeouts: readonly ProfitMarginCloseout[];
  events: readonly ProfitMarginEvent[];
  clients: readonly ProfitMarginClient[];
  granularity: ProfitMarginGranularity;
  rangeStart: Date;
  rangeEnd: Date;
}): ProfitMarginReport {
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);
  const eventsById = new Map(
    events
      .filter((event) => event.deletedAt == null)
      .map((event) => [String(event._id), event]),
  );
  const clientsById = new Map(
    clients
      .filter((client) => client.deletedAt == null)
      .map((client) => [String(client._id), client]),
  );
  const eventRows: ProfitMarginEventRow[] = [];
  let excludedCloseoutCount = 0;

  for (const closeout of closeouts) {
    if (closeout.deletedAt != null || String(closeout.status) !== "finalized") {
      continue;
    }
    const event = eventsById.get(String(closeout.eventId));
    const date = validDate(
      event?.startsAt ?? closeout.finalizedAt ?? closeout.capturedAt,
    );
    if (!event || !date) {
      excludedCloseoutCount += 1;
      continue;
    }
    if (date < start || date > end) continue;

    const clientId = String(event.clientId ?? "unknown-client");
    const client = clientsById.get(clientId);
    const segment = clientSegment(client);
    const rowMetrics = metricsOf({
      revenue: amount(closeout.actualRevenue),
      foodCost: amount(closeout.actualIngredientCost),
      laborCost: amount(closeout.actualLaborCost),
      equipmentCost: amount(closeout.actualVendorCost),
      overheadCost: amount(closeout.actualWasteCost),
      eventCount: 1,
    });
    eventRows.push({
      ...rowMetrics,
      key: String(closeout._id ?? closeout.eventId),
      eventId: String(event._id),
      clientId,
      title: event.title?.trim() || "Untitled event",
      clientName: clientName(client),
      segmentKey: segment.key,
      segmentLabel: segment.label,
      eventType: event.eventType?.trim() || "Unclassified",
      date,
    });
  }

  eventRows.sort((left, right) => right.date.getTime() - left.date.getTime());

  const clientGroups = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      segmentKey: string;
      segmentLabel: string;
      metrics: MutableMetrics;
    }
  >();
  const periodGroups = new Map<
    string,
    { start: Date; end: Date; label: string; metrics: MutableMetrics }
  >();
  const segmentGroups = new Map<
    string,
    { label: string; metrics: MutableMetrics }
  >();
  const summary = { ...EMPTY_METRICS };

  for (const row of eventRows) {
    addMetrics(summary, row);

    const clientGroup = clientGroups.get(row.clientId) ?? {
      clientId: row.clientId,
      clientName: row.clientName,
      segmentKey: row.segmentKey,
      segmentLabel: row.segmentLabel,
      metrics: { ...EMPTY_METRICS },
    };
    addMetrics(clientGroup.metrics, row);
    clientGroups.set(row.clientId, clientGroup);

    const periodStart = startOfPeriod(row.date, granularity);
    const periodKey = periodStart.toISOString();
    const periodGroup = periodGroups.get(periodKey) ?? {
      start: periodStart,
      end: endOfPeriod(periodStart, granularity),
      label: periodLabel(periodStart, granularity),
      metrics: { ...EMPTY_METRICS },
    };
    addMetrics(periodGroup.metrics, row);
    periodGroups.set(periodKey, periodGroup);

    const segmentGroup = segmentGroups.get(row.segmentKey) ?? {
      label: row.segmentLabel,
      metrics: { ...EMPTY_METRICS },
    };
    addMetrics(segmentGroup.metrics, row);
    segmentGroups.set(row.segmentKey, segmentGroup);
  }

  const clientRows = [...clientGroups.values()]
    .map((group) => ({
      ...metricsOf(group.metrics),
      key: group.clientId,
      clientId: group.clientId,
      clientName: group.clientName,
      segmentKey: group.segmentKey,
      segmentLabel: group.segmentLabel,
    }))
    .sort((left, right) => right.netProfit - left.netProfit);
  const periodRows = [...periodGroups.entries()]
    .map(([key, group]) => ({
      ...metricsOf(group.metrics),
      key,
      label: group.label,
      start: group.start,
      end: group.end,
    }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const segmentRows = [...segmentGroups.entries()]
    .map(([key, group]) => ({
      ...metricsOf(group.metrics),
      key,
      label: group.label,
    }))
    .sort((left, right) => {
      if (left.netMarginPercent == null) return 1;
      if (right.netMarginPercent == null) return -1;
      return right.netMarginPercent - left.netMarginPercent;
    });
  const comparableSegments = segmentRows.filter(
    (segment) => segment.netMarginPercent != null,
  );

  return {
    summary: metricsOf(summary),
    events: eventRows,
    clients: clientRows,
    periods: periodRows,
    segments: segmentRows,
    bestSegment: comparableSegments[0] ?? null,
    weakestSegment: comparableSegments.at(-1) ?? null,
    rangeStart: start,
    rangeEnd: end,
    excludedCloseoutCount,
  };
}

export function buildProfitMarginCsv(
  report: ProfitMarginReport,
  view: ProfitMarginView,
): string {
  let headers: string[];
  let rows: Array<Array<string | number>>;

  if (view === "event") {
    headers = [
      "Event",
      "Event date",
      "Event type",
      "Client",
      "Client segment",
      ...METRIC_HEADERS,
    ];
    rows = report.events.map((row) => [
      row.title,
      row.date.toISOString().slice(0, 10),
      row.eventType,
      row.clientName,
      row.segmentLabel,
      ...metricsColumns(row),
    ]);
  } else if (view === "client") {
    headers = ["Client", "Client segment", ...METRIC_HEADERS];
    rows = report.clients.map((row) => [
      row.clientName,
      row.segmentLabel,
      ...metricsColumns(row),
    ]);
  } else {
    headers = ["Period", "Period start", "Period end", ...METRIC_HEADERS];
    rows = report.periods.map((row) => [
      row.label,
      row.start.toISOString().slice(0, 10),
      row.end.toISOString().slice(0, 10),
      ...metricsColumns(row),
    ]);
  }

  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
