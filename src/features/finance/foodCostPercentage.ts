export type FoodCostGranularity = "week" | "month" | "quarter";

type DateValue = Date | number | string | null | undefined;

export type FoodCostEvent = {
  _id: string;
  title?: string | null;
  eventType?: string | null;
  startsAt?: DateValue;
  venueId?: string | null; // For venue premise filtering
};

export type FoodCostCloseout = {
  _id?: string;
  eventId: string;
  status?: string | null;
  actualRevenue?: number | null;
  actualIngredientCost?: number | null;
  capturedAt?: DateValue;
  finalizedAt?: DateValue;
  deletedAt?: DateValue;
};

export type FoodCostEventRow = {
  eventId: string;
  title: string;
  eventType: string;
  date: Date;
  revenue: number;
  foodCost: number;
  percentage: number | null;
  variance: number | null;
  aboveTarget: boolean;
};

export type FoodCostPeriod = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  revenue: number;
  foodCost: number;
  percentage: number | null;
  variance: number | null;
  aboveTarget: boolean;
  eventCount: number;
};

export type FoodCostReport = {
  periods: FoodCostPeriod[];
  events: FoodCostEventRow[];
  rangeStart: Date;
  rangeEnd: Date;
  totalRevenue: number;
  totalFoodCost: number;
  totalPercentage: number | null;
  totalVariance: number | null;
  aboveTarget: boolean;
  flaggedPeriodCount: number;
};

const PERIOD_COUNT: Record<FoodCostGranularity, number> = {
  week: 13,
  month: 12,
  quarter: 8,
};

function validDate(value: DateValue): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function amount(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function ratio(foodCost: number, revenue: number): number | null {
  return revenue <= 0 ? null : (foodCost / revenue) * 100;
}

function startOfPeriod(date: Date, granularity: FoodCostGranularity): Date {
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
  granularity: FoodCostGranularity,
): Date {
  const shifted = new Date(date);
  if (granularity === "week") shifted.setDate(shifted.getDate() + amount * 7);
  if (granularity === "month") shifted.setMonth(shifted.getMonth() + amount);
  if (granularity === "quarter")
    shifted.setMonth(shifted.getMonth() + amount * 3);
  return shifted;
}

function periodLabel(date: Date, granularity: FoodCostGranularity): string {
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

export function buildFoodCostReport({
  closeouts,
  events,
  granularity,
  targetPercentage,
  now = new Date(),
}: {
  closeouts: readonly FoodCostCloseout[];
  events: readonly FoodCostEvent[];
  granularity: FoodCostGranularity;
  targetPercentage: number;
  now?: Date;
}): FoodCostReport {
  const target = Number.isFinite(targetPercentage)
    ? Math.min(100, Math.max(0, targetPercentage))
    : 30;
  const eventsById = new Map(events.map((event) => [String(event._id), event]));
  const finalStart = startOfPeriod(now, granularity);
  const rangeStart = shiftPeriod(
    finalStart,
    -(PERIOD_COUNT[granularity] - 1),
    granularity,
  );
  const rangeEnd = shiftPeriod(finalStart, 1, granularity);
  const periods: FoodCostPeriod[] = Array.from(
    { length: PERIOD_COUNT[granularity] },
    (_, index) => {
      const start = shiftPeriod(rangeStart, index, granularity);
      return {
        key: start.toISOString(),
        label: periodLabel(start, granularity),
        start,
        end: shiftPeriod(start, 1, granularity),
        revenue: 0,
        foodCost: 0,
        percentage: null,
        variance: null,
        aboveTarget: false,
        eventCount: 0,
      };
    },
  );

  const eventRows: FoodCostEventRow[] = [];
  for (const closeout of closeouts) {
    if (closeout.deletedAt != null || String(closeout.status) !== "finalized") {
      continue;
    }
    const eventId = String(closeout.eventId);
    const event = eventsById.get(eventId);
    const date = validDate(
      event?.startsAt ?? closeout.finalizedAt ?? closeout.capturedAt,
    );
    if (!date || date < rangeStart || date >= rangeEnd) continue;

    const revenue = amount(closeout.actualRevenue);
    const foodCost = amount(closeout.actualIngredientCost);
    const percentage = ratio(foodCost, revenue);
    const variance = percentage == null ? null : percentage - target;
    const row: FoodCostEventRow = {
      eventId,
      title: event?.title?.trim() || "Untitled event",
      eventType: event?.eventType?.trim() || "Unclassified",
      date,
      revenue,
      foodCost,
      percentage,
      variance,
      aboveTarget: variance != null && variance > 0,
    };
    eventRows.push(row);

    const period = periods.find(
      (candidate) => date >= candidate.start && date < candidate.end,
    );
    if (period) {
      period.revenue += revenue;
      period.foodCost += foodCost;
      period.eventCount += 1;
    }
  }

  for (const period of periods) {
    period.percentage = ratio(period.foodCost, period.revenue);
    period.variance =
      period.percentage == null ? null : period.percentage - target;
    period.aboveTarget = period.variance != null && period.variance > 0;
  }

  eventRows.sort((a, b) => b.date.getTime() - a.date.getTime());
  const totalRevenue = eventRows.reduce((sum, event) => sum + event.revenue, 0);
  const totalFoodCost = eventRows.reduce(
    (sum, event) => sum + event.foodCost,
    0,
  );
  const totalPercentage = ratio(totalFoodCost, totalRevenue);
  const totalVariance =
    totalPercentage == null ? null : totalPercentage - target;

  return {
    periods,
    events: eventRows,
    rangeStart,
    rangeEnd,
    totalRevenue,
    totalFoodCost,
    totalPercentage,
    totalVariance,
    aboveTarget: totalVariance != null && totalVariance > 0,
    flaggedPeriodCount: periods.filter((period) => period.aboveTarget).length,
  };
}
