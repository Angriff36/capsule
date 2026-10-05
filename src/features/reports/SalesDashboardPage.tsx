import { useMemo } from "react";
import {
  useListLead,
  useListClient,
  useListPerson,
} from "@/lib/manifest-convex-react";
import { useAllEventReportRows } from "../facilities/useEventsById";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { formatMoney } from "@/lib/format";
import {
  commissionBasis,
  isBookedEvent,
  isQualifiedLead,
  NOT_KNOWN,
  percentOf,
  percentText,
} from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";

/**
 * Sales Dashboard (Priority 36)
 *
 * Pipeline visibility, booked revenue, conversion tracking, average event value,
 * activity/ownership reporting, 3% compensation basis.
 *
 * Features:
 * - Pipeline visualization by stage
 * - Revenue trends over time
 * - Conversion metrics
 * - Salesperson performance
 * - Top clients by revenue
 */

type LeadStage =
  "new" | "qualified" | "proposalSent" | "negotiating" | "converted" | "lost";

const STAGE_ORDER: Record<LeadStage, number> = {
  new: 1,
  qualified: 2,
  proposalSent: 3,
  negotiating: 4,
  converted: 5,
  lost: 99,
};

export function SalesDashboardPage() {
  const events = useAllEventReportRows();
  const leads = useListLead();
  const clients = useListClient();
  const people = useListPerson();

  // Process pipeline data
  const pipelineData = useMemo(() => {
    if (!leads) return [];

    const stageCounts = new Map<string, number>();
    leads.forEach((lead) => {
      const stage = String(lead.stage || "new");
      stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
    });

    return Array.from(stageCounts.entries())
      .sort(
        ([a], [b]) =>
          (STAGE_ORDER[a as LeadStage] || 99) -
          (STAGE_ORDER[b as LeadStage] || 99),
      )
      .map(([stage, count]) => ({
        stage: formatStage(stage),
        count,
      }));
  }, [leads]);

  // Calculate conversion metrics
  const conversionMetrics = useMemo(() => {
    const all = leads ?? [];
    const totalLeads = all.length;
    const converted = all.filter((l) => l.stage === "converted").length;
    const qualified = all.filter(isQualifiedLead).length;

    return {
      totalLeads,
      conversionRate: percentOf(converted, totalLeads),
      qualifiedRate: percentOf(qualified, totalLeads),
      convertedCount: converted,
    };
  }, [leads]);

  // Calculate revenue metrics
  const revenueMetrics = useMemo(() => {
    const bookedEvents = (events ?? []).filter(isBookedEvent);

    const totalRevenue = bookedEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const averageEventValue: number | string =
      bookedEvents.length > 0 ? totalRevenue / bookedEvents.length : NOT_KNOWN;

    return {
      totalRevenue,
      averageEventValue,
      bookedEvents: bookedEvents.length,
    };
  }, [events]);

  // Salesperson performance data
  const salespersonData = useMemo(() => {
    if (!events || !people) return [];

    const salesMap = new Map<
      string,
      { name: string; revenue: number; count: number }
    >();

    events.forEach((event) => {
      if (!event.assignedToId || !isBookedEvent(event)) return;

      const person = people.find((p) => p._id === event.assignedToId);
      if (!person) return;

      const name = `${person.givenName} ${person.familyName}`.trim();

      if (!salesMap.has(event.assignedToId)) {
        salesMap.set(event.assignedToId, { name, revenue: 0, count: 0 });
      }

      const data = salesMap.get(event.assignedToId)!;
      data.revenue += event.quotedPrice ?? 0;
      data.count += 1;
    });

    return Array.from(salesMap.values())
      .map((data) => ({
        name: data.name,
        revenue: data.revenue,
        count: data.count,
        avgValue: data.count > 0 ? data.revenue / data.count : 0,
        commissionBasis: commissionBasis(data.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [events, people]);

  // Top clients data
  const topClientsData = useMemo(() => {
    if (!events || !clients) return [];

    const clientMap = new Map<
      string,
      { name: string; revenue: number; eventCount: number }
    >();

    events.forEach((event) => {
      if (!event.clientId || !isBookedEvent(event)) return;

      const client = clients.find((c) => c._id === event.clientId);
      if (!client) return;

      const name = clientDisplayName(event.clientId, clients);

      if (!clientMap.has(event.clientId)) {
        clientMap.set(event.clientId, { name, revenue: 0, eventCount: 0 });
      }

      const data = clientMap.get(event.clientId)!;
      data.revenue += event.quotedPrice ?? 0;
      data.eventCount += 1;
    });

    return Array.from(clientMap.values())
      .map((data) => ({
        name: data.name,
        revenue: data.revenue,
        eventCount: data.eventCount,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [events, clients]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    {
      id: "total-leads",
      size: "small",
      content: (
        <StatCard
          title="Total Leads"
          main={{
            label: "Total",
            value: conversionMetrics.totalLeads,
            format: "number",
          }}
          rows={[
            {
              label: "Qualified",
              value: percentText(conversionMetrics.qualifiedRate),
            },
            {
              label: "Converted",
              value: percentText(conversionMetrics.conversionRate),
            },
          ]}
          tone="info"
          isLive
        />
      ),
    },
    {
      id: "booked-revenue",
      size: "small",
      content: (
        <StatCard
          title="Booked Revenue"
          main={{
            label: "Booked",
            value: revenueMetrics.totalRevenue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Events",
              value: revenueMetrics.bookedEvents,
              format: "number" as const,
            },
            {
              label: "Avg Value",
              value: revenueMetrics.averageEventValue,
              format: "currency" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "conversion-rate",
      size: "small",
      content: (
        <StatCard
          title="Conversion Rate"
          main={{
            label: "Rate",
            value: percentText(conversionMetrics.conversionRate),
          }}
          rows={[
            {
              label: "Converted",
              value: conversionMetrics.convertedCount,
              format: "number" as const,
            },
            {
              label: "Total",
              value: conversionMetrics.totalLeads,
              format: "number" as const,
            },
          ]}
          tone="ok"
          isLive
        />
      ),
    },
    {
      id: "avg-event-value",
      size: "small",
      content: (
        <StatCard
          title="Avg Event Value"
          main={{
            label: "Average",
            value: revenueMetrics.averageEventValue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Booked Events",
              value: revenueMetrics.bookedEvents,
              format: "number" as const,
            },
          ]}
          tone="accent"
          isLive
        />
      ),
    },
    {
      id: "pipeline-chart",
      size: "large",
      content: (
        <BarChart
          data={pipelineData}
          xAxisKey="stage"
          series={[
            { dataKey: "count", name: "Leads", color: "var(--color-info)" },
          ]}
          height={250}
        />
      ),
      title: "Pipeline by Stage",
    },
    {
      id: "salesperson-performance",
      size: "medium",
      content: (
        <TableDisplay
          columns={[
            { key: "name", header: "Salesperson", type: "string" as const },
            { key: "count", header: "Events", type: "number" as const },
            { key: "revenue", header: "Revenue", type: "currency" as const },
            { key: "avgValue", header: "Avg Value", type: "currency" as const },
            {
              key: "commissionBasis",
              header: "3% Basis",
              type: "currency" as const,
            },
          ]}
          data={salespersonData}
          height={300}
        />
      ),
      title: "Salesperson Performance",
    },
    {
      id: "top-clients",
      size: "medium",
      content: (
        <TableDisplay
          columns={[
            { key: "name", header: "Client", type: "string" as const },
            { key: "eventCount", header: "Events", type: "number" as const },
            {
              key: "revenue",
              header: "Total Revenue",
              type: "currency" as const,
            },
          ]}
          data={topClientsData}
          height={300}
        />
      ),
      title: "Top Clients by Revenue",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Sales Dashboard"
        lead="Pipeline visibility, conversion tracking, and sales performance metrics"
      />

      {events?.length === 0 && leads?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events or leads yet"
            hint="These figures fill in as leads come in and events are booked."
          />
        </div>
      ) : null}

      <DashboardGrid items={dashboardItems} />

      {/* Commission Basis Note */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">Commission Basis</h4>
        <p className="mt-1 text-xs text-ink-2">
          The 3% basis column is 3% of each salesperson&apos;s booked revenue (
          {formatMoney(commissionBasis(revenueMetrics.totalRevenue))} across all
          salespeople and unassigned events). It is a guide; the amount actually
          owed is the applied split on the Comp Master dashboard.
        </p>
      </div>

      <MetricDefinitionList
        metricIds={[
          "dashboard.leads",
          "dashboard.lead_qualified",
          "dashboard.lead_conversion",
          "dashboard.booked_revenue",
          "dashboard.booked_events",
          "dashboard.booked_average",
          "dashboard.commission_basis",
        ]}
      />
    </div>
  );
}

function formatStage(stage: string): string {
  const formatMap: Record<string, string> = {
    new: "New",
    qualified: "Qualified",
    proposalSent: "Proposal Sent",
    negotiating: "Negotiating",
    converted: "Converted",
    lost: "Lost",
  };
  return formatMap[stage] || stage;
}
