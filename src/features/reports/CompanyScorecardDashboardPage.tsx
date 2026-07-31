import { useMemo } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListLead,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { BarChart } from "@/ui/charts/BarChart";
import { PageHeader } from "@/ui/primitives";
import { formatMoney, formatCount, formatPercent } from "@/lib/format";

/**
 * Company Scorecard Dashboard (Priority 37)
 *
 * Executive scorecard of the core monthly numbers — revenue, food cost,
 * profit margin, lead conversion, completed events, and guests — with
 * real month-over-month movement computed from events, closeouts, and
 * leads. Capsule doesn't store company targets or metric owners, so the
 * cards show live actuals and how they moved against last month.
 */

interface ScorecardMetric {
  id: string;
  name: string;
  current: number | null;
  previous: number | null;
  unit: "currency" | "percent" | "count";
  /** Which direction counts as an improvement for this metric. */
  goodDirection: "up" | "down";
}

interface MonthNumbers {
  revenue: number;
  foodCostPct: number | null;
  profitMargin: number | null;
  conversionRate: number | null;
  completedEvents: number;
  guests: number;
}

export function CompanyScorecardDashboardPage() {
  const events = useListEvent();
  const closeouts = useListEventCloseout();
  const leads = useListLead();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthNumbers = useMemo(() => {
    const compute = (year: number, month: number): MonthNumbers => {
      const inMonth = (ts: number | null | undefined) => {
        if (!ts) return false;
        const date = new Date(ts);
        return date.getMonth() === month && date.getFullYear() === year;
      };

      const monthEvents = (events || []).filter((e) => inMonth(e.startsAt));
      const revenue = monthEvents.reduce(
        (sum, e) => sum + (e.quotedPrice || 0),
        0,
      );
      const completedEvents = monthEvents.filter(
        (e) => e.stage === "completed",
      ).length;
      const guests = monthEvents.reduce(
        (sum, e) => sum + (e.expectedHeadcount || 0),
        0,
      );

      const monthCloseouts = (closeouts || []).filter((c) =>
        inMonth(c.finalizedAt ?? c.capturedAt ?? c.createdAt),
      );
      const closeoutCost = monthCloseouts.reduce(
        (sum, c) => sum + (c.actualIngredientCost || 0),
        0,
      );
      const closeoutRevenue = monthCloseouts.reduce(
        (sum, c) => sum + c.grossProfit + (c.actualIngredientCost || 0),
        0,
      );
      const closeoutProfit = monthCloseouts.reduce(
        (sum, c) => sum + c.grossProfit,
        0,
      );
      const foodCostPct =
        closeoutRevenue > 0 ? (closeoutCost / closeoutRevenue) * 100 : null;
      const profitMargin =
        closeoutRevenue > 0 ? (closeoutProfit / closeoutRevenue) * 100 : null;

      const monthLeads = (leads || []).filter((l) => inMonth(l.createdAt));
      const conversionRate =
        monthLeads.length > 0
          ? (monthLeads.filter((l) => l.stage === "converted").length /
              monthLeads.length) *
            100
          : null;

      return {
        revenue,
        foodCostPct,
        profitMargin,
        conversionRate,
        completedEvents,
        guests,
      };
    };

    const previousDate = new Date(currentYear, currentMonth - 1, 1);
    return {
      current: compute(currentYear, currentMonth),
      previous: compute(previousDate.getFullYear(), previousDate.getMonth()),
    };
  }, [events, closeouts, leads, currentMonth, currentYear]);

  const scorecardMetrics: ScorecardMetric[] = [
    {
      id: "monthly-revenue",
      name: "Monthly Revenue",
      current: monthNumbers.current.revenue,
      previous: monthNumbers.previous.revenue,
      unit: "currency",
      goodDirection: "up",
    },
    {
      id: "food-cost-pct",
      name: "Food Cost %",
      current: monthNumbers.current.foodCostPct,
      previous: monthNumbers.previous.foodCostPct,
      unit: "percent",
      goodDirection: "down",
    },
    {
      id: "profit-margin",
      name: "Profit Margin",
      current: monthNumbers.current.profitMargin,
      previous: monthNumbers.previous.profitMargin,
      unit: "percent",
      goodDirection: "up",
    },
    {
      id: "lead-conversion",
      name: "Lead Conversion",
      current: monthNumbers.current.conversionRate,
      previous: monthNumbers.previous.conversionRate,
      unit: "percent",
      goodDirection: "up",
    },
    {
      id: "event-count",
      name: "Events Completed",
      current: monthNumbers.current.completedEvents,
      previous: monthNumbers.previous.completedEvents,
      unit: "count",
      goodDirection: "up",
    },
    {
      id: "guests",
      name: "Guests This Month",
      current: monthNumbers.current.guests,
      previous: monthNumbers.previous.guests,
      unit: "count",
      goodDirection: "up",
    },
  ];

  // Monthly trend data (last 6 months of revenue)
  const monthlyTrendData = useMemo(() => {
    if (!events) return [];

    const monthMap = new Map<string, { revenue: number; eventCount: number }>();

    // Populate with last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(monthKey, { revenue: 0, eventCount: 0 });
    }

    events.forEach((event) => {
      if (!event.startsAt) return;
      const date = new Date(event.startsAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) return;

      const data = monthMap.get(monthKey)!;
      data.revenue += event.quotedPrice || 0;
      data.eventCount += 1;
    });

    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      revenue: data.revenue,
      eventCount: data.eventCount,
    }));
  }, [events, currentYear, currentMonth]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    ...scorecardMetrics.map((metric) => ({
      id: metric.id,
      size: "medium" as const,
      content: <MetricCard metric={metric} />,
    })),
    {
      id: "monthly-trends",
      size: "full",
      content: (
        <BarChart
          data={monthlyTrendData}
          xAxisKey="month"
          series={[
            {
              dataKey: "revenue",
              name: "Revenue",
              color: "var(--color-brand)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Monthly Revenue Trend (6 Months)",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Company Scorecard"
        lead="The core monthly numbers with real month-over-month movement, live from your events, closeouts, and leads."
      />

      <DashboardGrid items={dashboardItems} />

      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-1 text-xs text-ink-2">
          Revenue and guest counts come from events scheduled this month. Food
          cost and profit margin come from finished event closeouts. Lead
          conversion counts leads created this month that converted. Capsule
          doesn't store company targets yet, so each card compares this month
          against last month instead.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ScorecardMetric }) {
  const formatValue = (value: number): string => {
    switch (metric.unit) {
      case "currency":
        return formatMoney(value);
      case "percent":
        return formatPercent(value);
      case "count":
        return formatCount(value);
    }
  };

  const change =
    metric.current != null && metric.previous != null && metric.previous !== 0
      ? ((metric.current - metric.previous) / Math.abs(metric.previous)) * 100
      : null;
  const improving =
    change == null
      ? null
      : metric.goodDirection === "up"
        ? change >= 0
        : change <= 0;

  return (
    <div className="rounded-sm border border-line bg-panel p-4">
      <h3 className="font-semibold text-ink">{metric.name}</h3>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xl font-bold text-ink">
          {metric.current != null ? formatValue(metric.current) : "—"}
        </span>
        {change != null ? (
          <span
            className={`text-xs font-medium ${improving ? "text-ok" : "text-danger"}`}
          >
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs last
            month
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        {metric.current == null
          ? "Nothing recorded yet this month."
          : metric.previous != null
            ? `Last month: ${formatValue(metric.previous)}`
            : "No data for last month yet."}
      </p>
    </div>
  );
}
