import { useMemo } from "react";
import {
  useListEvent,
  useListRevenueAttribution,
  useListPerson,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { PageHeader } from "@/ui/primitives";
import { formatMoney } from "@/lib/format";
import { calculateCommissionMetrics } from "./compMasterValues";

export function CompMasterDashboardPage() {
  const events = useListEvent();
  const attributions = useListRevenueAttribution();
  const people = useListPerson();
  const cancelledEventIds = useMemo(
    () =>
      new Set(
        (events ?? [])
          .filter((event) => event.stage === "cancelled")
          .map((event) => String(event._id)),
      ),
    [events],
  );
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const allTime = useMemo(
    () =>
      events && attributions && people
        ? calculateCommissionMetrics({
            periodStart: Number.NEGATIVE_INFINITY,
            periodEnd: Number.POSITIVE_INFINITY,
            cancelledEventIds,
            people,
            attributions,
          })
        : null,
    [events, attributions, people, cancelledEventIds],
  );
  const thisMonth = useMemo(
    () =>
      events && attributions && people
        ? calculateCommissionMetrics({
            periodStart: monthStart,
            periodEnd: monthEnd,
            cancelledEventIds,
            people,
            attributions,
          })
        : null,
    [events, attributions, people, cancelledEventIds, monthStart, monthEnd],
  );
  const eventName = new Map(
    (events ?? []).map((event) => [String(event._id), event.title]),
  );
  const personName = new Map(
    (people ?? []).map((person) => [
      String(person._id),
      `${person.givenName} ${person.familyName}`.trim(),
    ]),
  );
  const appliedRows = (attributions ?? [])
    .filter(
      (attr) =>
        attr.attributionType === "sales_commission" &&
        attr.status === "applied" &&
        attr.salespersonId &&
        !cancelledEventIds.has(String(attr.eventId)),
    )
    .map((attr) => ({
      event: eventName.get(String(attr.eventId)) ?? "Unknown event",
      salesperson:
        personName.get(String(attr.salespersonId)) ?? "Unknown salesperson",
      commission: Number(attr.allocatedAmount) || 0,
      status: "Applied",
    }))
    .sort((a, b) => b.commission - a.commission);
  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    {
      id: "total",
      size: "small",
      content: (
        <StatCard
          title="Applied Commission"
          main={{
            value: allTime?.totalCommission ?? 0,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Applied records",
              value: appliedRows.length,
              format: "number" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "month",
      size: "small",
      content: (
        <StatCard
          title="Applied This Month"
          main={{
            value: thisMonth?.totalCommission ?? 0,
            format: "currency" as const,
          }}
          rows={[{ label: "Period", value: "Calendar month" }]}
          tone="accent"
          isLive
        />
      ),
    },
    {
      id: "people",
      size: "small",
      content: (
        <StatCard
          title="Salespeople"
          main={{
            value: allTime?.salespeople.length ?? 0,
            format: "number" as const,
          }}
          rows={[{ label: "Basis", value: "Applied allocations" }]}
          tone="ok"
          isLive
        />
      ),
    },
    {
      id: "chart",
      size: "large",
      title: "Applied Commission by Salesperson",
      content: (
        <BarChart
          data={(allTime?.salespeople ?? []).map((person) => ({
            salesperson: person.name,
            commission: person.commission,
          }))}
          xAxisKey="salesperson"
          series={[
            {
              dataKey: "commission",
              name: "Applied commission",
              color: "var(--color-info)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
    },
    {
      id: "records",
      size: "full",
      title: "Applied Sales Commission Records",
      content: (
        <TableDisplay
          columns={[
            { key: "event", header: "Event", type: "string" as const },
            {
              key: "salesperson",
              header: "Salesperson",
              type: "string" as const,
            },
            {
              key: "commission",
              header: "Allocated Commission",
              type: "currency" as const,
            },
            {
              key: "status",
              header: "Attribution Status",
              type: "string" as const,
            },
          ]}
          data={appliedRows}
          height={350}
        />
      ),
    },
  ];
  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Comp Master Dashboard"
        lead="Applied sales commission allocations, shown directly from revenue attribution records."
      />
      <DashboardGrid items={dashboardItems} />
      <div className="mt-6 rounded-sm border border-line bg-panel p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-2 text-xs text-ink-2">
          Only RevenueAttribution records whose type is sales commission and
          whose status is applied are included. Allocated amount is already the
          commission amount; no percentage or payment status is inferred.
          Cancelled events are excluded consistently.
        </p>
      </div>
    </div>
  );
}
