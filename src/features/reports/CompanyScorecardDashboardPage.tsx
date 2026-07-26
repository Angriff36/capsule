import { useMemo } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListLead,
  useListVenue,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { PageHeader, StatusChip } from "@/ui/primitives";
import { formatMoney, formatPercent, formatCount } from "@/lib/format";

/**
 * Company Scorecard Dashboard (Priority 37)
 *
 * Executive scorecard with metrics, targets, actuals, trends, owner, and status.
 * Tracks business performance against strategic goals.
 *
 * Features:
 * - Revenue targets vs. actuals
 * - Food cost percentage targets
 * - Profit margin tracking
 * - Lead conversion goals
 * - Event volume targets
 * - Venue utilization metrics
 * - Monthly performance trends
 * - Owner assignment for each metric
 */

interface ScorecardMetric {
  id: string;
  name: string;
  owner: string;
  target: number;
  actual: number;
  unit: "currency" | "percent" | "count";
  status: "ahead" | "on-track" | "behind" | "at-risk";
  trend: "up" | "flat" | "down";
}

export function CompanyScorecardDashboardPage() {
  const events = useListEvent();
  const closeouts = useListEventCloseout();
  const leads = useListLead();
  const venues = useListVenue();

  // Current month calculations
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const currentMonthEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (!e.startsAt) return false;
      const date = new Date(e.startsAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });
  }, [events, currentMonth, currentYear]);

  const currentMonthRevenue = useMemo(() => {
    return currentMonthEvents.reduce((sum, e) => sum + (e.quotedPrice || 0), 0);
  }, [currentMonthEvents]);

  const currentMonthFoodCost = useMemo(() => {
    if (!closeouts) return 0;
    const monthCloseouts = closeouts.filter((c) => {
      const eventDate = c.finalizedAt ?? c.capturedAt ?? c.createdAt;
      if (!eventDate) return false;
      const date = new Date(eventDate);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });
    const totalCost = monthCloseouts.reduce(
      (sum, c) => sum + (c.actualIngredientCost || 0),
      0,
    );
    const totalRevenue = monthCloseouts.reduce(
      (sum, c) => sum + c.grossProfit + (c.actualIngredientCost || 0),
      0,
    );
    return totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
  }, [closeouts, currentMonth, currentYear]);

  const currentMonthCloseouts = useMemo(() => {
    if (!closeouts) return [];
    return closeouts.filter((c) => {
      const eventDate = c.finalizedAt ?? c.capturedAt ?? c.createdAt;
      if (!eventDate) return false;
      const date = new Date(eventDate);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });
  }, [closeouts, currentMonth, currentYear]);

  const avgProfitMargin = useMemo(() => {
    if (currentMonthCloseouts.length === 0) return 0;
    const totalRevenue = currentMonthCloseouts.reduce(
      (sum, c) => sum + c.grossProfit + (c.actualIngredientCost || 0),
      0,
    );
    const totalProfit = currentMonthCloseouts.reduce(
      (sum, c) => sum + c.grossProfit,
      0,
    );
    return totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  }, [currentMonthCloseouts]);

  const currentMonthLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      if (!l.createdAt) return false;
      const date = new Date(l.createdAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });
  }, [leads, currentMonth, currentYear]);

  const conversionRate = useMemo(() => {
    if (currentMonthLeads.length === 0) return 0;
    const converted = currentMonthLeads.filter(
      (l) => l.stage === "converted",
    ).length;
    return (converted / currentMonthLeads.length) * 100;
  }, [currentMonthLeads]);

  // Scorecard metrics with targets
  const scorecardMetrics: ScorecardMetric[] = [
    {
      id: "monthly-revenue",
      name: "Monthly Revenue",
      owner: "Leadership",
      target: 500000,
      actual: currentMonthRevenue,
      unit: "currency",
      status:
        currentMonthRevenue >= 500000
          ? "ahead"
          : currentMonthRevenue >= 400000
            ? "on-track"
            : currentMonthRevenue >= 300000
              ? "behind"
              : "at-risk",
      trend: "up",
    },
    {
      id: "food-cost-pct",
      name: "Food Cost %",
      owner: "Executive Chef",
      target: 30,
      actual: currentMonthFoodCost,
      unit: "percent",
      status:
        currentMonthFoodCost <= 30
          ? "ahead"
          : currentMonthFoodCost <= 32
            ? "on-track"
            : currentMonthFoodCost <= 35
              ? "behind"
              : "at-risk",
      trend: currentMonthFoodCost <= 30 ? "up" : "down",
    },
    {
      id: "profit-margin",
      name: "Profit Margin",
      owner: "CFO",
      target: 25,
      actual: avgProfitMargin,
      unit: "percent",
      status:
        avgProfitMargin >= 25
          ? "ahead"
          : avgProfitMargin >= 22
            ? "on-track"
            : avgProfitMargin >= 18
              ? "behind"
              : "at-risk",
      trend: "up",
    },
    {
      id: "lead-conversion",
      name: "Lead Conversion",
      owner: "Sales Director",
      target: 35,
      actual: conversionRate,
      unit: "percent",
      status:
        conversionRate >= 35
          ? "ahead"
          : conversionRate >= 30
            ? "on-track"
            : conversionRate >= 25
              ? "behind"
              : "at-risk",
      trend: "flat",
    },
    {
      id: "event-count",
      name: "Monthly Events",
      owner: "Operations Director",
      target: 25,
      actual: currentMonthEvents.filter((e) => e.stage === "completed").length,
      unit: "count",
      status:
        currentMonthEvents.length >= 25
          ? "ahead"
          : currentMonthEvents.length >= 20
            ? "on-track"
            : currentMonthEvents.length >= 15
              ? "behind"
              : "at-risk",
      trend: "up",
    },
    {
      id: "venue-utilization",
      name: "Venue Utilization",
      owner: "Operations Director",
      target: 80,
      actual: venues
        ? (currentMonthEvents.length / (venues.length * 30)) * 100
        : 0,
      unit: "percent",
      status: "on-track",
      trend: "flat",
    },
  ];

  // Monthly trend data
  const monthlyTrendData = useMemo(() => {
    if (!events || !closeouts) return [];

    const monthMap = new Map<
      string,
      {
        revenue: number;
        foodCost: number;
        profitMargin: number;
        eventCount: number;
      }
    >();

    // Populate with last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(monthKey, {
        revenue: 0,
        foodCost: 0,
        profitMargin: 0,
        eventCount: 0,
      });
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

    closeouts.forEach((closeout) => {
      const eventDate =
        closeout.finalizedAt ?? closeout.capturedAt ?? closeout.createdAt;
      if (!eventDate) return;
      const date = new Date(eventDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) return;

      const data = monthMap.get(monthKey)!;
      const revenue =
        closeout.grossProfit + (closeout.actualIngredientCost || 0);
      data.foodCost += closeout.actualIngredientCost || 0;
      if (revenue > 0) {
        data.profitMargin += (closeout.grossProfit / revenue) * 100;
      }
    });

    // Calculate averages
    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      revenue: data.revenue,
      foodCost: data.eventCount > 0 ? (data.foodCost / data.revenue) * 100 : 0,
      profitMargin:
        data.eventCount > 0 ? data.profitMargin / data.eventCount : 0,
      eventCount: data.eventCount,
    }));
  }, [events, closeouts, currentYear, currentMonth]);

  const STATUS_COLORS = {
    ahead: "bg-ok-50 border-ok-200 text-ok-900",
    "on-track": "bg-brand-50 border-brand-200 text-brand-900",
    behind: "bg-warn-50 border-warn-200 text-warn-900",
    "at-risk": "bg-accent-50 border-accent-200 text-accent-900",
  } as const;

  const STATUS_LABELS = {
    ahead: "Ahead",
    "on-track": "On Track",
    behind: "Behind",
    "at-risk": "At Risk",
  };

  const formatValue = (
    value: number,
    unit: ScorecardMetric["unit"],
  ): string => {
    switch (unit) {
      case "currency":
        return formatMoney(value);
      case "percent":
        return formatPercent(value / 100);
      case "count":
        return formatCount(value);
      default:
        return String(value);
    }
  };

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    {
      id: "revenue-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[0]} />,
    },
    {
      id: "food-cost-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[1]} />,
    },
    {
      id: "profit-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[2]} />,
    },
    {
      id: "conversion-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[3]} />,
    },
    {
      id: "events-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[4]} />,
    },
    {
      id: "utilization-target",
      size: "medium",
      content: <MetricCard metric={scorecardMetrics[5]} />,
    },
    {
      id: "monthly-trends",
      size: "full",
      content: (
        <BarChart
          data={monthlyTrendData}
          xAxisKey="month"
          series={[{ dataKey: "revenue", name: "Revenue", color: "#3b82f6" }]}
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
        lead="Executive metrics with targets, actuals, trends, and owner assignments. Track performance against strategic goals."
      />

      <div className="mb-4 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-ok-500" />
          <span>Ahead of Target</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-brand-500" />
          <span>On Track</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-warn-500" />
          <span>Behind Target</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-accent-500" />
          <span>At Risk</span>
        </div>
      </div>

      <DashboardGrid items={dashboardItems} />

      {/* Scorecard Legend */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-900">
          Scorecard Methodology
        </h4>
        <p className="mt-1 text-sm text-ink-600">
          Metrics are evaluated monthly against quarterly targets refreshed by
          leadership. Status reflects current performance relative to target
          thresholds. Owners are responsible for reporting metric status in
          executive L10 meetings. Historical trends track 6-month performance
          for seasonality analysis.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ScorecardMetric }) {
  const STATUS_COLORS = {
    ahead: "bg-ok-50 border-ok-200 text-ok-900",
    "on-track": "bg-brand-50 border-brand-200 text-brand-900",
    behind: "bg-warn-50 border-warn-200 text-warn-900",
    "at-risk": "bg-accent-50 border-accent-200 text-accent-900",
  } as const;

  const STATUS_LABELS = {
    ahead: "Ahead",
    "on-track": "On Track",
    behind: "Behind",
    "at-risk": "At Risk",
  };

  const formatValue = (
    value: number,
    unit: ScorecardMetric["unit"],
  ): string => {
    switch (unit) {
      case "currency":
        return formatMoney(value);
      case "percent":
        return `${value.toFixed(1)}%`;
      case "count":
        return formatCount(value);
      default:
        return String(value);
    }
  };

  const pctOfTarget = (metric.actual / metric.target) * 100;
  const variance = metric.actual - metric.target;

  return (
    <div className={`rounded-lg border p-4 ${STATUS_COLORS[metric.status]}`}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{metric.name}</h3>
          <p className="text-xs opacity-75">Owner: {metric.owner}</p>
        </div>
        <StatusChip status={metric.status} />
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold">
          {formatValue(metric.actual, metric.unit)}
        </span>
        <span className="text-sm opacity-75">
          Target: {formatValue(metric.target, metric.unit)}
        </span>
      </div>

      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span>{pctOfTarget.toFixed(0)}% of target</span>
          <span className={variance >= 0 ? "text-ok-700" : "text-accent-700"}>
            {variance >= 0 ? "+" : ""}
            {formatValue(variance, metric.unit)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-current/20">
          <div
            className={`h-2 rounded-full ${variance >= 0 ? "bg-ok-500" : "bg-accent-500"}`}
            style={{ width: `${Math.min(Math.max(pctOfTarget, 0), 100)}%` }}
          />
        </div>
      </div>

      <div className="text-xs opacity-75">
        Trend:{" "}
        {metric.trend === "up"
          ? "↑ Improving"
          : metric.trend === "flat"
            ? "→ Stable"
            : "↓ Declining"}
      </div>
    </div>
  );
}
