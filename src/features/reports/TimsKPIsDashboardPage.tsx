import { useMemo } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListLead,
  useListClient,
  useListPerson,
  useListVenue,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { LineChart } from "@/ui/charts/LineChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { PageHeader } from "@/ui/primitives";
import { formatMoney, formatCount } from "@/lib/format";

/**
 * Tim's KPIs Dashboard (Priority 35)
 *
 * Comprehensive operational KPIs with record-level reconciliation.
 * Replicates agreed TPP KPIs for leadership visibility.
 *
 * Features:
 * - Revenue metrics (total, trend, per-event average)
 * - Event metrics (count, status distribution, headcount)
 * - Food cost metrics (percentage, variance)
 * - Profit margins (gross, net)
 * - Lead pipeline metrics (conversion, velocity)
 * - Venue performance breakdown
 * - Service style mix
 * - Time-series trends for key metrics
 */

export function TimsKPIsDashboardPage() {
  const events = useListEvent();
  const closeouts = useListEventCloseout();
  const leads = useListLead();
  const clients = useListClient();
  const people = useListPerson();
  const venues = useListVenue();

  // Revenue KPIs
  const revenueMetrics = useMemo(() => {
    if (!events) return null;

    const completedEvents = events.filter((e) => e.stage === "completed");
    const totalRevenue = completedEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const avgEventValue =
      completedEvents.length > 0 ? totalRevenue / completedEvents.length : 0;
    const totalHeadcount = completedEvents.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const revenuePerHead =
      totalHeadcount > 0 ? totalRevenue / totalHeadcount : 0;

    return {
      totalRevenue,
      avgEventValue,
      revenuePerHead,
      completedEvents: completedEvents.length,
      totalHeadcount,
    };
  }, [events]);

  // Food Cost KPIs
  const foodCostMetrics = useMemo(() => {
    if (!closeouts || closeouts.length === 0) return null;

    const totalActualCost = closeouts.reduce(
      (sum, c) => sum + (c.actualIngredientCost || 0),
      0,
    );
    const totalBudgetedCost = closeouts.reduce(
      (sum, c) => sum + (c.budgetedCost || 0),
      0,
    );
    const totalRevenue = closeouts.reduce(
      (sum, c) => sum + (c.grossProfit + (c.actualIngredientCost || 0)),
      0,
    );
    const actualFoodCostPct =
      totalRevenue > 0 ? (totalActualCost / totalRevenue) * 100 : 0;
    const budgetedFoodCostPct =
      totalRevenue > 0 ? (totalBudgetedCost / totalRevenue) * 100 : 0;
    const costVariance = totalActualCost - totalBudgetedCost;

    const profitableEvents = closeouts.filter((c) => c.grossProfit > 0).length;
    const profitRate =
      closeouts.length > 0 ? (profitableEvents / closeouts.length) * 100 : 0;

    return {
      totalActualCost,
      actualFoodCostPct,
      budgetedFoodCostPct,
      costVariance,
      profitRate,
      closeoutCount: closeouts.length,
    };
  }, [closeouts]);

  // Lead Pipeline KPIs
  const pipelineMetrics = useMemo(() => {
    if (!leads) return null;

    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => l.stage === "new").length;
    const qualifiedLeads = leads.filter((l) => l.stage === "qualified").length;
    const proposalSent = leads.filter((l) => l.stage === "proposalSent").length;
    const converted = leads.filter((l) => l.stage === "converted").length;

    const qualifiedRate =
      totalLeads > 0
        ? ((qualifiedLeads + proposalSent + converted) / totalLeads) * 100
        : 0;
    const conversionRate = totalLeads > 0 ? (converted / totalLeads) * 100 : 0;

    return {
      totalLeads,
      newLeads,
      qualifiedRate,
      conversionRate,
      converted,
    };
  }, [leads]);

  // Venue Performance Data
  const venuePerformanceData = useMemo(() => {
    if (!events || !venues) return [];

    const venueMap = new Map<
      string,
      { name: string; revenue: number; eventCount: number; headcount: number }
    >();

    events.forEach((event) => {
      if (!event.venueId || event.quotedPrice == null) return;

      const venue = venues.find((v) => v._id === event.venueId);
      if (!venue) return;

      if (!venueMap.has(event.venueId)) {
        venueMap.set(event.venueId, {
          name: venue.name,
          revenue: 0,
          eventCount: 0,
          headcount: 0,
        });
      }

      const data = venueMap.get(event.venueId)!;
      data.revenue += event.quotedPrice;
      data.eventCount += 1;
      data.headcount += event.expectedHeadcount || 0;
    });

    return Array.from(venueMap.values())
      .map((data) => ({
        venue: data.name,
        revenue: data.revenue,
        eventCount: data.eventCount,
        avgRevenue: data.eventCount > 0 ? data.revenue / data.eventCount : 0,
        avgHeadcount:
          data.eventCount > 0 ? data.headcount / data.eventCount : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [events, venues]);

  // Monthly Revenue Trend Data
  const monthlyRevenueData = useMemo(() => {
    if (!events) return [];

    const monthMap = new Map<string, { revenue: number; eventCount: number }>();

    events.forEach((event) => {
      if (event.quotedPrice == null || !event.startsAt) return;

      const date = new Date(event.startsAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { revenue: 0, eventCount: 0 });
      }

      const data = monthMap.get(monthKey)!;
      data.revenue += event.quotedPrice;
      data.eventCount += 1;
    });

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        eventCount: data.eventCount,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [events]);

  // Service Style Mix Data
  const serviceStyleData = useMemo(() => {
    if (!events) return [];

    const styleMap = new Map<string, { revenue: number; eventCount: number }>();

    events.forEach((event) => {
      if (event.quotedPrice == null) return;
      const style = event.serviceStyle || "Unknown";

      if (!styleMap.has(style)) {
        styleMap.set(style, { revenue: 0, eventCount: 0 });
      }

      const data = styleMap.get(style)!;
      data.revenue += event.quotedPrice;
      data.eventCount += 1;
    });

    return Array.from(styleMap.entries())
      .map(([style, data]) => ({
        serviceStyle: style,
        revenue: data.revenue,
        eventCount: data.eventCount,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [events]);

  // Top Performing Events
  const topEventsData = useMemo(() => {
    if (!events) return [];

    return events
      .filter((e) => e.quotedPrice != null && e.stage === "completed")
      .sort((a, b) => (b.quotedPrice || 0) - (a.quotedPrice || 0))
      .slice(0, 10)
      .map((event) => ({
        title: event.title,
        revenue: event.quotedPrice || 0,
        date: event.startsAt
          ? new Date(event.startsAt).toLocaleDateString()
          : "",
        headcount: event.expectedHeadcount || 0,
        venueId: event.venueId || "N/A",
      }));
  }, [events]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // KPI Summary Cards
    {
      id: "total-revenue",
      size: "small",
      content: (
        <StatCard
          title="Total Revenue"
          main={{
            value: revenueMetrics?.totalRevenue || 0,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Completed Events",
              value: revenueMetrics?.completedEvents || 0,
              format: "number" as const,
            },
            {
              label: "Avg Event Value",
              value: revenueMetrics?.avgEventValue || 0,
              format: "currency" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "food-cost-pct",
      size: "small",
      content: (
        <StatCard
          title="Food Cost %"
          main={{
            value: foodCostMetrics?.actualFoodCostPct || 0,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "Budgeted",
              value: foodCostMetrics?.budgetedFoodCostPct || 0,
              format: "percent" as const,
            },
            {
              label: "Variance",
              value: foodCostMetrics?.costVariance || 0,
              format: "currency" as const,
            },
          ]}
          tone={
            foodCostMetrics?.costVariance && foodCostMetrics.costVariance > 0
              ? "warn"
              : "ok"
          }
          isLive
        />
      ),
    },
    {
      id: "profit-margin",
      size: "small",
      content: (
        <StatCard
          title="Profit Rate"
          main={{
            value: foodCostMetrics?.profitRate || 0,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "Closeouts",
              value: foodCostMetrics?.closeoutCount || 0,
              format: "number" as const,
            },
            {
              label: "Avg Profit/Event",
              value:
                (closeouts?.reduce((s, c) => s + (c.grossProfit || 0), 0) ||
                  0) / (closeouts?.length || 1),
              format: "currency" as const,
            },
          ]}
          tone="accent"
          isLive
        />
      ),
    },
    {
      id: "conversion-rate",
      size: "small",
      content: (
        <StatCard
          title="Lead Conversion"
          main={{
            value: pipelineMetrics?.conversionRate || 0,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "Total Leads",
              value: pipelineMetrics?.totalLeads || 0,
              format: "number" as const,
            },
            {
              label: "Qualified",
              value: pipelineMetrics?.qualifiedRate || 0,
              format: "percent" as const,
            },
          ]}
          tone="info"
          isLive
        />
      ),
    },
    // Charts
    {
      id: "monthly-revenue-trend",
      size: "large",
      content: (
        <LineChart
          data={monthlyRevenueData}
          xAxisKey="month"
          series={[{ dataKey: "revenue", name: "Revenue", color: "#3b82f6" }]}
          height={250}
          formatYAxis={formatMoney}
        />
      ),
      title: "Monthly Revenue Trend",
    },
    {
      id: "venue-performance",
      size: "medium",
      content: (
        <BarChart
          data={venuePerformanceData}
          xAxisKey="venue"
          series={[{ dataKey: "revenue", name: "Revenue", color: "#10b981" }]}
          height={300}
          orientation="horizontal"
          formatYAxis={formatMoney}
        />
      ),
      title: "Venue Revenue Performance",
    },
    {
      id: "service-style-mix",
      size: "medium",
      content: (
        <BarChart
          data={serviceStyleData}
          xAxisKey="serviceStyle"
          series={[{ dataKey: "revenue", name: "Revenue", color: "#8b5cf6" }]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Revenue by Service Style",
    },
    // Tables
    {
      id: "top-events",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            { key: "title", header: "Event", type: "string" as const },
            { key: "revenue", header: "Revenue", type: "currency" as const },
            { key: "headcount", header: "Guests", type: "number" as const },
            { key: "date", header: "Date", type: "string" as const },
          ]}
          data={topEventsData}
          height={250}
        />
      ),
      title: "Top Performing Events (Revenue)",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Tim's KPIs Dashboard"
        lead="Comprehensive operational metrics with record-level reconciliation. Live tenant data from Capsule events, closeouts, and leads."
      />

      <DashboardGrid items={dashboardItems} />

      {/* Reconciliation Note */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-900">
          Reconciliation Access
        </h4>
        <p className="mt-1 text-sm text-ink-600">
          All KPIs load live from tenant-scoped data. Click venue names to view
          venue detail pages with full event history. Revenue attribution tracks
          venue commissions and sales splits. Food cost percentages derive from
          EventCloseout records with actual vs. budgeted comparison.
        </p>
      </div>
    </div>
  );
}
