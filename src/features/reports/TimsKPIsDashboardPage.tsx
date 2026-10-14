import { useMemo, useState } from "react";
import { useListServiceStyle, useListVenue } from "@/lib/manifest-convex-react";
import { useAllEventReportRows } from "../facilities/useEventsById";
import {
  eventServiceStyleKey,
  eventServiceStyleLabel,
} from "../events/eventServiceStyle";
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
import {
  useAllRowsOnRequest,
  useProposalsByIds,
} from "@/lib/financeScopedQueries";
import { KpiRecordList } from "./KpiRecordList";
import { EosPanel } from "../eos/EosShared";
import { TimsScorecardSection } from "./TimsScorecardSection";

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

const TITLE = "Tim's KPIs Dashboard";
const LEAD =
  "The numbers that run the business, live from your events, closeouts, and leads — with the detail behind each one a click away.";

/**
 * Every figure here is all-time (every event, closeout and lead the company
 * has), so nothing is read until the user asks for the dashboard.
 */
export function TimsKPIsDashboardPage() {
  const [requested, setRequested] = useState(false);
  if (requested) return <TimsKPIsDashboardBody />;
  return (
    <div className="operations-stage supply-stage">
      <PageHeader eyebrow="EOS · Data" title={TITLE} lead={LEAD} />
      <p className="mt-3 max-w-160 text-ink-2">
        These figures add up every event, closeout and lead on file.
      </p>
      <button
        type="button"
        className="btn btn-primary mt-4 self-start justify-self-start"
        onClick={() => setRequested(true)}
      >
        Show all-time KPIs
      </button>
    </div>
  );
}

function TimsKPIsDashboardBody() {
  const events = useAllEventReportRows();
  const closeouts = useAllRowsOnRequest("eventCloseouts", true);
  const leads = useAllRowsOnRequest("leads", true);
  // Only the proposals the leads point at decide conversion.
  const proposals = useProposalsByIds(
    leads?.map((lead) => (lead.proposalId ? String(lead.proposalId) : null)),
  );
  const venues = useListVenue();
  const serviceStyles = useListServiceStyle();
  const now = useMemo(() => new Date(), []);

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

  return (
    <div className="operations-stage supply-stage">
      <PageHeader eyebrow="EOS · Data" title={TITLE} lead={LEAD} />

      {events?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events yet"
            hint="The figures fill in as events are booked and completed."
          />
        </div>
      ) : null}

      {events?.length ? (
        <TimsScorecardSection events={events} now={now} />
      ) : null}

      <div className="mt-5">
        <EosPanel
          tone="vision"
          eyebrow="All time"
          title="Money and leads"
          lead="Every completed event, closeout and lead on file."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          </div>
        </EosPanel>
      </div>

      <div className="mt-5">
        <EosPanel tone="people" eyebrow="Trend" title="Revenue by month">
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
        </EosPanel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <EosPanel tone="data" eyebrow="Where" title="Revenue by venue">
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
        </EosPanel>
        <EosPanel tone="vision" eyebrow="How" title="Revenue by service style">
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
        </EosPanel>
      </div>

      <div className="mt-5">
        <EosPanel tone="traction" eyebrow="Best" title="Top events by revenue">
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
        </EosPanel>
      </div>

      <div className="mt-5">
        <EosPanel
          tone="process"
          eyebrow="Check a number"
          title="Records behind each figure"
          lead="Open a line to see every record a figure adds up, and how each number is counted."
        >
          <KpiRecordList
            events={events ?? []}
            closeouts={closeouts ?? []}
            leads={leads ?? []}
            acceptedProposals={acceptedProposalIds(proposals)}
          />
          <MetricDefinitionList
            metricIds={[
              "dashboard.win_rate",
              "dashboard.pipeline_value",
              "dashboard.weighted_forecast",
              "dashboard.booked_ahead",
              "dashboard.lost_revenue",
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
        </EosPanel>
      </div>
    </div>
  );
}
