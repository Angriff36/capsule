import { useMemo } from "react";
import {
  useListEventCloseout,
  useListLead,
  useListProposal,
  useListServiceStyle,
  useListVenue,
} from "@/lib/manifest-convex-react";
import { useAllEventReportRows } from "../facilities/useEventsById";
import {
  eventServiceStyleKey,
  eventServiceStyleLabel,
} from "../events/eventServiceStyle";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { LineChart } from "@/ui/charts/LineChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import {
  budgetedFoodCostPercent,
  foodCostPercent,
  isCompletedEvent,
  acceptedProposalIds,
  isConvertedLead,
  isQualifiedLead,
  NOT_KNOWN,
  percentOf,
  percentText,
} from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";
import { KpiRecordList } from "./KpiRecordList";

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
  const events = useAllEventReportRows();
  const closeouts = useListEventCloseout();
  const leads = useListLead();
  const proposals = useListProposal();
  const venues = useListVenue();
  const serviceStyles = useListServiceStyle();

  // Revenue KPIs
  const revenueMetrics = useMemo(() => {
    if (!events) return null;

    const completedEvents = events.filter(isCompletedEvent);
    const totalRevenue = completedEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const avgEventValue: number | string =
      completedEvents.length > 0
        ? totalRevenue / completedEvents.length
        : NOT_KNOWN;
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
    const all = closeouts ?? [];

    const totalActualCost = all.reduce(
      (sum, c) => sum + (c.actualIngredientCost || 0),
      0,
    );
    const totalBudgetedCost = all.reduce(
      (sum, c) => sum + (c.budgetedCost || 0),
      0,
    );
    const actualFoodCostPct = foodCostPercent(all);
    const budgetedFoodCostPct = budgetedFoodCostPercent(all);
    const costVariance =
      actualFoodCostPct == null || budgetedFoodCostPct == null
        ? null
        : totalActualCost - totalBudgetedCost;

    const profitableEvents = all.filter((c) => c.grossProfit > 0).length;
    const profitRate = percentOf(profitableEvents, all.length);
    const avgProfit: number | string =
      all.length > 0
        ? all.reduce((s, c) => s + (c.grossProfit || 0), 0) / all.length
        : NOT_KNOWN;

    return {
      totalActualCost,
      actualFoodCostPct,
      budgetedFoodCostPct,
      costVariance,
      profitRate,
      avgProfit,
      closeoutCount: all.length,
    };
  }, [closeouts]);

  // Lead Pipeline KPIs
  const pipelineMetrics = useMemo(() => {
    const all = leads ?? [];
    const totalLeads = all.length;
    const newLeads = all.filter((l) => l.stage === "new").length;
    const accepted = acceptedProposalIds(proposals);
    const converted = all.filter((lead) =>
      isConvertedLead(lead, accepted),
    ).length;

    const qualifiedRate = percentOf(
      all.filter(
        (lead) => isQualifiedLead(lead) || isConvertedLead(lead, accepted),
      ).length,
      totalLeads,
    );
    const conversionRate = percentOf(converted, totalLeads);

    return {
      totalLeads,
      newLeads,
      qualifiedRate,
      conversionRate,
      converted,
    };
  }, [leads, proposals]);

  // Venue Performance Data
  const venuePerformanceData = useMemo(() => {
    if (!events || !venues) return [];

    const venueMap = new Map<
      string,
      { name: string; revenue: number; eventCount: number; headcount: number }
    >();

    events.forEach((event) => {
      if (!event.venueId || !isCompletedEvent(event)) return;

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
      data.revenue += event.quotedPrice ?? 0;
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
      if (!isCompletedEvent(event) || !event.startsAt) return;

      const date = new Date(event.startsAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { revenue: 0, eventCount: 0 });
      }

      const data = monthMap.get(monthKey)!;
      data.revenue += event.quotedPrice ?? 0;
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

    const styleMap = new Map<
      string,
      { label: string; revenue: number; eventCount: number }
    >();

    events.forEach((event) => {
      if (!isCompletedEvent(event)) return;
      const style = eventServiceStyleKey(event);

      if (!styleMap.has(style)) {
        styleMap.set(style, {
          label: eventServiceStyleLabel({
            ...event,
            serviceStyle: (serviceStyles ?? []).find(
              (row) => String(row._id) === String(event.serviceStyleId),
            ),
          }),
          revenue: 0,
          eventCount: 0,
        });
      }

      const data = styleMap.get(style)!;
      data.revenue += event.quotedPrice ?? 0;
      data.eventCount += 1;
    });

    return Array.from(styleMap.values())
      .map((data) => ({
        serviceStyle: data.label,
        revenue: data.revenue,
        eventCount: data.eventCount,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [events, serviceStyles]);

  // Top Performing Events
  const topEventsData = useMemo(() => {
    if (!events) return [];

    return events
      .filter(isCompletedEvent)
      .sort((a, b) => (b.quotedPrice || 0) - (a.quotedPrice || 0))
      .slice(0, 10)
      .map((event) => ({
        title: event.title,
        revenue: event.quotedPrice || 0,
        date: event.startsAt ? formatDate(event.startsAt) : "",
        headcount: event.expectedHeadcount || 0,
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
            label: "Revenue",
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
            label: "Actual",
            value: percentText(foodCostMetrics.actualFoodCostPct),
          }}
          rows={[
            {
              label: "Budgeted",
              value: percentText(foodCostMetrics.budgetedFoodCostPct),
            },
            {
              label: "Variance",
              value: foodCostMetrics.costVariance ?? NOT_KNOWN,
              format: "currency" as const,
            },
          ]}
          tone={
            foodCostMetrics.costVariance && foodCostMetrics.costVariance > 0
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
            label: "Rate",
            value: percentText(foodCostMetrics.profitRate),
          }}
          rows={[
            {
              label: "Closeouts",
              value: foodCostMetrics.closeoutCount,
              format: "number" as const,
            },
            {
              label: "Avg Profit/Event",
              value: foodCostMetrics.avgProfit,
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
            label: "Rate",
            value: percentText(pipelineMetrics.conversionRate),
          }}
          rows={[
            {
              label: "Total Leads",
              value: pipelineMetrics.totalLeads,
              format: "number" as const,
            },
            {
              label: "Qualified",
              value: percentText(pipelineMetrics.qualifiedRate),
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
          series={[
            {
              dataKey: "revenue",
              name: "Revenue",
              color: "var(--color-info)",
            },
          ]}
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
          series={[
            { dataKey: "revenue", name: "Revenue", color: "var(--color-ok)" },
          ]}
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
        lead="The numbers that run the business, live from your events, closeouts, and leads — with the detail behind each one a click away."
      />

      {events?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events yet"
            hint="The figures fill in as events are booked and completed."
          />
        </div>
      ) : null}

      <DashboardGrid items={dashboardItems} />

      <KpiRecordList
        events={events ?? []}
        closeouts={closeouts ?? []}
        leads={leads ?? []}
        acceptedProposals={acceptedProposalIds(proposals)}
      />

      {/* Reconciliation Note */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-1 text-xs text-ink-2">
          Every number updates live from your own data. Revenue comes from
          completed events' quoted prices. Food cost percentages come from event
          closeouts, comparing actual against budgeted. Lead numbers come from
          your sales pipeline.
        </p>
      </div>

      <MetricDefinitionList
        metricIds={[
          "dashboard.completed_revenue",
          "dashboard.completed_events",
          "dashboard.completed_average",
          "dashboard.food_cost_percent",
          "dashboard.food_cost_budget",
          "dashboard.profitable_share",
          "dashboard.lead_conversion",
          "dashboard.lead_qualified",
          "dashboard.leads",
        ]}
      />
    </div>
  );
}
