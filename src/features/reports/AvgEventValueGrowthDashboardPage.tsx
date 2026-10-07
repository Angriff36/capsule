import { useMemo } from "react";
import {
  useListServiceStyle,
  useListOccasion,
  useListVenue,
  useListPerson,
} from "@/lib/manifest-convex-react";
import { useAllEventReportRows } from "../facilities/useEventsById";
import {
  eventServiceStyleKey,
  eventServiceStyleLabel,
} from "../events/eventServiceStyle";
import { breakdownBy } from "./avgEventBreakdowns";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { monthKeyLabel, trendFromSeries } from "@/ui/charts/Sparkline";
import { BarChart } from "@/ui/charts/BarChart";
import { LineChart } from "@/ui/charts/LineChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { formatMoney } from "@/lib/format";
import {
  isCompletedEvent,
  NOT_KNOWN,
  percentText,
} from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";

const NOT_ENOUGH_HISTORY = "Not enough history";

/**
 * Avg Event Value Growth Dashboard (Priority 38)
 *
 * Event value trend analysis, mix breakdown, driver identification,
 * and drill-down by salesperson, service style, occasion, and venue.
 *
 * Features:
 * - Average event value trend over time
 * - Growth rate calculation (MoM, YoY)
 * - Value breakdown by service style
 * - Value breakdown by occasion
 * - Value breakdown by venue
 * - Value breakdown by salesperson
 * - Event size vs. value correlation
 * - Top growing segments
 */

export function AvgEventValueGrowthDashboardPage() {
  const events = useAllEventReportRows();
  const serviceStyles = useListServiceStyle();
  const occasions = useListOccasion();
  const venues = useListVenue();
  const people = useListPerson();

  // Filter completed events with quoted price
  const completedEvents = useMemo(() => {
    return (events || []).filter(isCompletedEvent);
  }, [events]);

  // Overall average event value
  const overallMetrics = useMemo(() => {
    if (completedEvents.length === 0) return null;

    const totalRevenue = completedEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const avgEventValue = totalRevenue / completedEvents.length;
    const withGuests = completedEvents.filter(
      (e) => (e.expectedHeadcount || 0) > 0,
    );
    const totalHeadcount = withGuests.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const revenueWithGuests = withGuests.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const avgHeadcount =
      withGuests.length > 0 ? totalHeadcount / withGuests.length : null;
    const revenuePerHead =
      totalHeadcount > 0 ? revenueWithGuests / totalHeadcount : null;

    return {
      avgEventValue,
      totalRevenue,
      totalEvents: completedEvents.length,
      totalHeadcount,
      avgHeadcount,
      revenuePerHead,
    };
  }, [completedEvents]);

  // Monthly trend data
  const monthlyTrendData = useMemo(() => {
    if (completedEvents.length === 0) return [];

    const monthMap = new Map<
      string,
      { totalRevenue: number; eventCount: number; totalHeadcount: number }
    >();

    completedEvents.forEach((event) => {
      if (!event.startsAt) return;
      const date = new Date(event.startsAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          totalRevenue: 0,
          eventCount: 0,
          totalHeadcount: 0,
        });
      }

      const data = monthMap.get(monthKey)!;
      data.totalRevenue += event.quotedPrice || 0;
      data.eventCount += 1;
      data.totalHeadcount += event.expectedHeadcount || 0;
    });

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        avgEventValue: data.totalRevenue / data.eventCount,
        eventCount: data.eventCount,
        revenuePerHead:
          data.totalHeadcount > 0 ? data.totalRevenue / data.totalHeadcount : 0,
        totalRevenue: data.totalRevenue,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [completedEvents]);

  // Calculate growth rates
  const growthMetrics = useMemo(() => {
    // Calendar months in local time: this month vs last month (MoM) and vs
    // the same month last year (YoY). A month with no events gives null.
    const now = new Date();
    const keyOf = (year: number, month: number) => {
      const date = new Date(year, month, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    };
    const avgFor = (key: string) =>
      monthlyTrendData.find((d) => d.month === key)?.avgEventValue ?? null;
    const growth = (current: number | null, base: number | null) =>
      current != null && base != null && base > 0
        ? ((current - base) / base) * 100
        : null;

    const current = avgFor(keyOf(now.getFullYear(), now.getMonth()));
    const momGrowth = growth(
      current,
      avgFor(keyOf(now.getFullYear(), now.getMonth() - 1)),
    );
    const yoyGrowth = growth(
      current,
      avgFor(keyOf(now.getFullYear() - 1, now.getMonth())),
    );

    return { momGrowth, yoyGrowth };
  }, [monthlyTrendData]);

  // Breakdown by service style
  const byServiceStyle = useMemo(() => {
    if (!serviceStyles) return [];
    return breakdownBy(
      completedEvents,
      (event) => eventServiceStyleKey(event),
      (styleId, event) =>
        serviceStyles.find((s) => s._id === styleId)?.name ||
        eventServiceStyleLabel(event),
      "No service style",
    ).map((row) => ({
      serviceStyle: row.label,
      avgEventValue: row.avgEventValue,
      eventCount: row.eventCount,
      totalRevenue: row.totalRevenue,
      revenuePerHead: row.revenuePerHead ?? 0,
    }));
  }, [completedEvents, serviceStyles]);

  // Breakdown by occasion
  const byOccasion = useMemo(() => {
    if (!occasions) return [];
    return breakdownBy(
      completedEvents,
      // The occasion from the list, else the occasion typed on the event.
      (event) =>
        (event.occasionId
          ? occasions.find((o) => o._id === event.occasionId)?.name
          : null) ||
        event.eventType?.trim().toLowerCase() ||
        null,
      (name) => name.charAt(0).toUpperCase() + name.slice(1),
      "No occasion",
    ).map((row) => ({
      occasion: row.label,
      avgEventValue: row.avgEventValue,
      eventCount: row.eventCount,
      totalRevenue: row.totalRevenue,
    }));
  }, [completedEvents, occasions]);

  // Breakdown by venue
  const byVenue = useMemo(() => {
    if (!venues) return [];
    return breakdownBy(
      completedEvents,
      (event) => event.venueId,
      (id) => venues.find((v) => v._id === id)?.name || "Venue not found",
      "No venue",
    ).map((row) => ({
      venue: row.label,
      avgEventValue: row.avgEventValue,
      eventCount: row.eventCount,
      totalRevenue: row.totalRevenue,
    }));
  }, [completedEvents, venues]);

  // Breakdown by salesperson
  const bySalesperson = useMemo(() => {
    if (!people) return [];
    return breakdownBy(
      completedEvents,
      (event) => event.assignedToId,
      (id) => {
        const person = people.find((p) => p._id === id);
        return person
          ? `${person.givenName} ${person.familyName}`.trim()
          : "Person not found";
      },
      "No salesperson",
    ).map((row) => ({
      salesperson: row.label,
      avgEventValue: row.avgEventValue,
      eventCount: row.eventCount,
      totalRevenue: row.totalRevenue,
    }));
  }, [completedEvents, people]);

  // Event size vs value correlation
  const sizeValueData = useMemo(() => {
    const sizeBuckets = [
      { label: "< 50", min: 0, max: 50, count: 0, revenue: 0 },
      { label: "50-100", min: 50, max: 100, count: 0, revenue: 0 },
      { label: "100-200", min: 100, max: 200, count: 0, revenue: 0 },
      { label: "200-500", min: 200, max: 500, count: 0, revenue: 0 },
      { label: "500+", min: 500, max: Infinity, count: 0, revenue: 0 },
    ];

    completedEvents.forEach((event) => {
      const headcount = event.expectedHeadcount || 0;
      const bucket = sizeBuckets.find(
        (b) => headcount >= b.min && headcount < b.max,
      );
      if (bucket) {
        bucket.count += 1;
        bucket.revenue += event.quotedPrice || 0;
      }
    });

    return sizeBuckets.map((bucket) => ({
      headcount: bucket.label,
      avgEventValue: bucket.count > 0 ? bucket.revenue / bucket.count : 0,
      eventCount: bucket.count,
    }));
  }, [completedEvents]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // Summary metrics
    {
      id: "avg-event-value",
      size: "small",
      content: (
        <StatCard
          title="Avg Event Value"
          main={{
            value: overallMetrics?.avgEventValue ?? NOT_KNOWN,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Total Events",
              value: overallMetrics?.totalEvents || 0,
              format: "number" as const,
            },
            {
              label: "Total Revenue",
              value: overallMetrics?.totalRevenue || 0,
              format: "currency" as const,
            },
          ]}
          tone="brand"
          isLive
          trend={trendFromSeries(
            monthlyTrendData,
            (row) => row.avgEventValue,
            (row) => monthKeyLabel(row.month),
          )}
        />
      ),
    },
    {
      id: "mom-growth",
      size: "small",
      content: (
        <StatCard
          title="MoM Growth"
          main={{
            value: percentText(growthMetrics.momGrowth, NOT_ENOUGH_HISTORY),
          }}
          rows={[
            {
              label: "YoY Growth",
              value: percentText(growthMetrics.yoyGrowth, NOT_ENOUGH_HISTORY),
            },
            {
              label: "Revenue/Head",
              value: overallMetrics?.revenuePerHead ?? NOT_KNOWN,
              format: "currency" as const,
            },
          ]}
          tone={
            growthMetrics.momGrowth == null
              ? "ink"
              : growthMetrics.momGrowth >= 0
                ? "ok"
                : "warn"
          }
          isLive
        />
      ),
    },
    {
      id: "avg-headcount",
      size: "small",
      content: (
        <StatCard
          title="Avg Headcount"
          main={{
            value: overallMetrics?.avgHeadcount ?? NOT_KNOWN,
            format: "number" as const,
          }}
          rows={[
            {
              label: "Total Guests",
              value: overallMetrics?.totalHeadcount ?? 0,
              format: "number" as const,
            },
          ]}
          tone="info"
          isLive
        />
      ),
    },
    {
      id: "revenue-per-head",
      size: "small",
      content: (
        <StatCard
          title="Revenue Per Head"
          main={{
            value: overallMetrics?.revenuePerHead ?? NOT_KNOWN,
            format: "currency" as const,
          }}
          tone="accent"
          isLive
          trend={trendFromSeries(
            monthlyTrendData,
            (row) => row.revenuePerHead,
            (row) => monthKeyLabel(row.month),
          )}
        />
      ),
    },
    // Trend chart
    {
      id: "avg-value-trend",
      size: "full",
      content: (
        <LineChart
          data={monthlyTrendData}
          xAxisKey="month"
          series={[
            {
              dataKey: "avgEventValue",
              name: "Avg Event Value",
              color: "var(--color-info)",
            },
          ]}
          height={250}
          formatYAxis={formatMoney}
        />
      ),
      title: "Average Event Value Trend (Monthly)",
    },
    // Breakdown charts
    {
      id: "by-service-style",
      size: "medium",
      content: (
        <BarChart
          data={byServiceStyle}
          xAxisKey="serviceStyle"
          series={[
            {
              dataKey: "avgEventValue",
              name: "Avg Value",
              color: "var(--color-brand)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Avg Event Value by Service Style",
    },
    {
      id: "by-occasion",
      size: "medium",
      content: (
        <BarChart
          data={byOccasion}
          xAxisKey="occasion"
          series={[
            {
              dataKey: "avgEventValue",
              name: "Avg Value",
              color: "var(--color-ok)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Avg Event Value by Occasion",
    },
    // Tables
    {
      id: "by-venue-table",
      size: "medium",
      content: (
        <TableDisplay
          columns={[
            { key: "venue", header: "Venue", type: "string" as const },
            { key: "eventCount", header: "Events", type: "number" as const },
            {
              key: "avgEventValue",
              header: "Avg Value",
              type: "currency" as const,
            },
            {
              key: "totalRevenue",
              header: "Total Revenue",
              type: "currency" as const,
            },
          ]}
          data={byVenue}
          height={300}
        />
      ),
      title: "Top Venues by Avg Event Value",
    },
    {
      id: "by-salesperson-table",
      size: "medium",
      content: (
        <TableDisplay
          columns={[
            {
              key: "salesperson",
              header: "Salesperson",
              type: "string" as const,
            },
            { key: "eventCount", header: "Events", type: "number" as const },
            {
              key: "avgEventValue",
              header: "Avg Value",
              type: "currency" as const,
            },
            {
              key: "totalRevenue",
              header: "Total Revenue",
              type: "currency" as const,
            },
          ]}
          data={bySalesperson}
          height={300}
        />
      ),
      title: "Salesperson Performance by Avg Value",
    },
    {
      id: "size-correlation",
      size: "medium",
      content: (
        <BarChart
          data={sizeValueData.filter((d) => d.eventCount > 0)}
          xAxisKey="headcount"
          series={[
            {
              dataKey: "avgEventValue",
              name: "Avg Value",
              color: "var(--color-accent)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Event Value by Headcount Range",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Average Event Value Growth"
        lead="Event value trend analysis with breakdowns by service style, occasion, venue, salesperson, and event size. Track growth MoM and YoY."
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

      {/* Analysis Note */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          What drives event value
        </h4>
        <p className="mt-1 text-xs text-ink-2">
          Average event value reflects pricing, the mix of event types, and
          guest counts. Growth compares this month to last month (MoM) and to
          the same month last year (YoY). The breakdowns show which service
          styles, occasions, venues, and salespeople bring in the most valuable
          events, and how event size affects the price.
        </p>
      </div>

      <MetricDefinitionList
        metricIds={[
          "dashboard.completed_average",
          "dashboard.completed_events",
          "dashboard.completed_revenue",
          "dashboard.growth_month",
          "dashboard.growth_year",
          "dashboard.guests",
          "dashboard.revenue_per_guest",
        ]}
      />
    </div>
  );
}
