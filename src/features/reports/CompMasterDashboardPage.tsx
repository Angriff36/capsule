import { useMemo, useState } from "react";
import { useListPerson } from "@/lib/manifest-convex-react";
import { useAllRowsOnRequest, useWindowRows } from "@/lib/financeScopedQueries";
import { useEventsById } from "../facilities/useEventsById";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { formatMoney } from "@/lib/format";
import { FINANCE_ROUTES } from "../finance/financeRoutes";
import { calculateCommissionMetrics } from "./compMasterValues";
import { MetricDefinitionList } from "./MetricDefinitionList";
import { CompGoalsSection } from "./CompGoalsSection";

const LOADING = "Loading…";
const NOT_ASKED = "Show all-time to see";

export function CompMasterDashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  // This month's applied splits by default; every split only when the user
  // asks for the all-time figures.
  const [showAllTime, setShowAllTime] = useState(false);
  const monthAttributions = useWindowRows("revenueAttributions", {
    fields: ["appliedAt"],
    ranges: [{ from: monthStart, to: monthEnd }],
  });
  const allAttributions = useAllRowsOnRequest(
    "revenueAttributions",
    showAllTime,
  );
  const attributions = showAllTime ? allAttributions : monthAttributions;
  const people = useListPerson();
  const eventIds = useMemo(
    () =>
      attributions === undefined
        ? undefined
        : attributions.map((attr) => attr.eventId),
    [attributions],
  );
  const events = useEventsById(eventIds);
  const cancelledEventIds = useMemo(
    () =>
      new Set(
        (events ?? [])
          .filter((event) => event.stage === "cancelled")
          .map((event) => String(event._id)),
      ),
    [events],
  );
  const allTime = useMemo(
    () =>
      showAllTime && events && attributions && people
        ? calculateCommissionMetrics({
            periodStart: Number.NEGATIVE_INFINITY,
            periodEnd: Number.POSITIVE_INFINITY,
            cancelledEventIds,
            people,
            attributions,
          })
        : null,
    [showAllTime, events, attributions, people, cancelledEventIds],
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
      attributionId: String(attr._id),
      eventId: String(attr.eventId),
      event: eventName.get(String(attr.eventId)) ?? "Unknown event",
      salesperson:
        personName.get(String(attr.salespersonId)) ?? "Unknown salesperson",
      commission: Number(attr.allocatedAmount) || 0,
      appliedAt: attr.appliedAt ?? null,
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
            value:
              allTime?.totalCommission ?? (showAllTime ? LOADING : NOT_ASKED),
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Applied lines",
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
            value: thisMonth?.totalCommission ?? LOADING,
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
            value:
              allTime?.salespeople.length ??
              (showAllTime ? LOADING : NOT_ASKED),
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
          data={((allTime ?? thisMonth)?.salespeople ?? []).map((person) => ({
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
      title: "Applied Sales Commission List",
      content: (
        <TableDisplay
          columns={[
            {
              key: "event",
              header: "Event",
              type: "string" as const,
              href: (row) => `/events/${String(row.eventId)}`,
            },
            {
              key: "salesperson",
              header: "Salesperson",
              type: "string" as const,
            },
            {
              key: "commission",
              header: "Allocated Commission",
              type: "currency" as const,
              href: (row) =>
                FINANCE_ROUTES.revenueAttributionDetail(
                  String(row.attributionId),
                ),
            },
            { key: "appliedAt", header: "Applied", type: "date" as const },
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
        lead="The sales lead's performance goals from the owner's Comp Master Status sheet, then applied sales commission allocations, taken straight from revenue attribution."
      />
      <CompGoalsSection />
      {showAllTime && attributions?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No commission applied yet"
            hint="Applied sales commission splits show here."
          />
        </div>
      ) : null}
      {showAllTime ? null : (
        <button
          type="button"
          className="btn btn-ghost btn-sm mb-4"
          onClick={() => setShowAllTime(true)}
        >
          Show all-time commission
        </button>
      )}
      <DashboardGrid items={dashboardItems} />
      <div className="mt-6 rounded-sm border border-line bg-panel p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-2 text-xs text-ink-2">
          Only revenue attribution entries marked as sales commission with a
          status of applied are included. Allocated amount is already the
          commission amount; no percentage or payment status is inferred.
          Cancelled events are excluded consistently. Open an event or an amount
          in the list to see the record behind it.
        </p>
      </div>
      <MetricDefinitionList
        metricIds={[
          "dashboard.commission_applied",
          "dashboard.commission_month",
          "dashboard.salespeople",
        ]}
      />
    </div>
  );
}
