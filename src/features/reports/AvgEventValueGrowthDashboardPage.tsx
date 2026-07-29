import { useMemo } from "react";
import {
  useListEvent,
  useListServiceStyle,
  useListOccasion,
  useListVenue,
  useListPerson,
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
import { formatMoney } from "@/lib/format";

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
  const events = useListEvent();
  const serviceStyles = useListServiceStyle();
  const occasions = useListOccasion();
  const venues = useListVenue();
  const people = useListPerson();

  // Filter completed events with quoted price
  const completedEvents = useMemo(() => {
    return (events || []).filter(
      (e) =>
        e.quotedPrice != null && e.quotedPrice > 0 && e.stage === "completed",
    );
  }, [events]);

  // Overall average event value
  const overallMetrics = useMemo(() => {
    if (completedEvents.length === 0) return null;

    const totalRevenue = completedEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const avgEventValue = totalRevenue / completedEvents.length;
    const totalHeadcount = completedEvents.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const avgHeadcount = totalHeadcount / completedEvents.length;
    const revenuePerHead =
      totalHeadcount > 0 ? totalRevenue / totalHeadcount : 0;

    return {
      avgEventValue,
      totalRevenue,
      totalEvents: completedEvents.length,
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
    if (monthlyTrendData.length < 2) return null;

    const latest = monthlyTrendData[monthlyTrendData.length - 1];
    const previous = monthlyTrendData[monthlyTrendData.length - 2];

    const momGrowth =
      latest.avgEventValue > 0 && previous.avgEventValue > 0
        ? ((latest.avgEventValue - previous.avgEventValue) /
            previous.avgEventValue) *
          100
        : 0;

    // Year-over-year (compare with same month last year)
    let yoyGrowth = 0;
    const lastYearSameMonth = monthlyTrendData.find((d) => {
      const [latestYear, latestMonth] = latest.month.split("-");
      const [dYear, dMonth] = d.month.split("-");
      return (
        dMonth === latestMonth && parseInt(dYear) === parseInt(latestYear) - 1
      );
    });

    if (lastYearSameMonth && lastYearSameMonth.avgEventValue > 0) {
      yoyGrowth =
        ((latest.avgEventValue - lastYearSameMonth.avgEventValue) /
          lastYearSameMonth.avgEventValue) *
        100;
    }

    return { momGrowth, yoyGrowth };
  }, [monthlyTrendData]);

  // Breakdown by service style
  const byServiceStyle = useMemo(() => {
    if (!serviceStyles) return [];

    const styleMap = new Map<
      string,
      { totalRevenue: number; eventCount: number; totalHeadcount: number }
    >();

    completedEvents.forEach((event) => {
      const styleId = event.serviceStyle || "unknown";
      if (!styleMap.has(styleId)) {
        styleMap.set(styleId, {
          totalRevenue: 0,
          eventCount: 0,
          totalHeadcount: 0,
        });
      }
      const data = styleMap.get(styleId)!;
      data.totalRevenue += event.quotedPrice || 0;
      data.eventCount += 1;
      data.totalHeadcount += event.expectedHeadcount || 0;
    });

    return Array.from(styleMap.entries())
      .map(([styleId, data]) => {
        const style = serviceStyles.find((s) => s._id === styleId);
        return {
          serviceStyle: style?.name || styleId,
          avgEventValue: data.totalRevenue / data.eventCount,
          eventCount: data.eventCount,
          totalRevenue: data.totalRevenue,
          revenuePerHead:
            data.totalHeadcount > 0
              ? data.totalRevenue / data.totalHeadcount
              : 0,
        };
      })
      .sort((a, b) => b.avgEventValue - a.avgEventValue);
  }, [completedEvents, serviceStyles]);

  // Breakdown by occasion
  const byOccasion = useMemo(() => {
    if (!occasions) return [];

    const occasionMap = new Map<
      string,
      { totalRevenue: number; eventCount: number; totalHeadcount: number }
    >();

    completedEvents.forEach((event) => {
      const occasionId = event.occasionId || "unknown";
      if (!occasionMap.has(occasionId)) {
        occasionMap.set(occasionId, {
          totalRevenue: 0,
          eventCount: 0,
          totalHeadcount: 0,
        });
      }
      const data = occasionMap.get(occasionId)!;
      data.totalRevenue += event.quotedPrice || 0;
      data.eventCount += 1;
      data.totalHeadcount += event.expectedHeadcount || 0;
    });

    return Array.from(occasionMap.entries())
      .map(([occasionId, data]) => {
        const occasion = occasions.find((o) => o._id === occasionId);
        return {
          occasion: occasion?.name || occasionId,
          avgEventValue: data.totalRevenue / data.eventCount,
          eventCount: data.eventCount,
          totalRevenue: data.totalRevenue,
        };
      })
      .sort((a, b) => b.avgEventValue - a.avgEventValue);
  }, [completedEvents, occasions]);

  // Breakdown by venue
  const byVenue = useMemo(() => {
    if (!venues) return [];

    const venueMap = new Map<
      string,
      { totalRevenue: number; eventCount: number; totalHeadcount: number }
    >();

    completedEvents.forEach((event) => {
      const venueId = event.venueId || "unknown";
      if (!venueMap.has(venueId)) {
        venueMap.set(venueId, {
          totalRevenue: 0,
          eventCount: 0,
          totalHeadcount: 0,
        });
      }
      const data = venueMap.get(venueId)!;
      data.totalRevenue += event.quotedPrice || 0;
      data.eventCount += 1;
      data.totalHeadcount += event.expectedHeadcount || 0;
    });

    return Array.from(venueMap.entries())
      .map(([venueId, data]) => {
        const venue = venues.find((v) => v._id === venueId);
        return {
          venue: venue?.name || venueId,
          avgEventValue: data.totalRevenue / data.eventCount,
          eventCount: data.eventCount,
          totalRevenue: data.totalRevenue,
        };
      })
      .sort((a, b) => b.avgEventValue - a.avgEventValue)
      .slice(0, 10);
  }, [completedEvents, venues]);

  // Breakdown by salesperson
  const bySalesperson = useMemo(() => {
    if (!people) return [];

    const salesMap = new Map<
      string,
      { totalRevenue: number; eventCount: number; totalHeadcount: number }
    >();

    completedEvents.forEach((event) => {
      const salesId = event.assignedToId || "unassigned";
      if (!salesMap.has(salesId)) {
        salesMap.set(salesId, {
          totalRevenue: 0,
          eventCount: 0,
          totalHeadcount: 0,
        });
      }
      const data = salesMap.get(salesId)!;
      data.totalRevenue += event.quotedPrice || 0;
      data.eventCount += 1;
      data.totalHeadcount += event.expectedHeadcount || 0;
    });

    return Array.from(salesMap.entries())
      .map(([salesId, data]) => {
        const person = people.find((p) => p._id === salesId);
        return {
          salesperson: person
            ? `${person.givenName} ${person.familyName}`.trim()
            : salesId,
          avgEventValue: data.totalRevenue / data.eventCount,
          eventCount: data.eventCount,
          totalRevenue: data.totalRevenue,
        };
      })
      .sort((a, b) => b.avgEventValue - a.avgEventValue);
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
            value: overallMetrics?.avgEventValue || 0,
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
            value: growthMetrics?.momGrowth || 0,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "YoY Growth",
              value: growthMetrics?.yoyGrowth || 0,
              format: "percent" as const,
            },
            {
              label: "Revenue/Head",
              value: overallMetrics?.revenuePerHead || 0,
              format: "currency" as const,
            },
          ]}
          tone={(growthMetrics?.momGrowth || 0) >= 0 ? "ok" : "warn"}
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
            value: overallMetrics?.avgHeadcount || 0,
            format: "number" as const,
          }}
          rows={[
            {
              label: "Total Guests",
              value:
                (overallMetrics?.totalEvents || 0) *
                (overallMetrics?.avgHeadcount || 0),
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
            value: overallMetrics?.revenuePerHead || 0,
            format: "currency" as const,
          }}
          tone="accent"
          isLive
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

      <DashboardGrid items={dashboardItems} />

      {/* Analysis Note */}
      <div className="mt-6 rounded-lg border border-line bg-inset p-4">
        <h4 className="text-sm font-semibold text-ink">
          What drives event value
        </h4>
        <p className="mt-1 text-sm text-ink-2">
          Average event value reflects pricing, the mix of event types, and
          guest counts. Growth compares this month to last month (MoM) and to
          the same month last year (YoY). The breakdowns show which service
          styles, occasions, venues, and salespeople bring in the most valuable
          events, and how event size affects the price.
        </p>
      </div>
    </div>
  );
}
