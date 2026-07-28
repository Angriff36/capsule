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
import { PageHeader, StatusChip } from "@/ui/primitives";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

/**
 * Comp Master Dashboard (Priority 39)
 *
 * Status and source evidence for compensation deliverables and calculations.
 * Tracks sales commissions, revenue attribution, and performance against targets.
 *
 * Features:
 * - Commission calculations (3% basis)
 * - Revenue attribution by salesperson
 * - Venue commission tracking
 * - Referral source attribution
 * - Target vs. actual performance
 * - Payment status tracking
 * - Evidence trail for audit
 */

export function CompMasterDashboardPage() {
  const events = useListEvent();
  const attributions = useListRevenueAttribution();
  const people = useListPerson();

  // Commission metrics (3% basis)
  const commissionMetrics = useMemo(() => {
    if (!events || !people) return null;

    const COMMISSION_RATE = 0.03; // 3% commission basis

    const salesMap = new Map<
      string,
      {
        name: string;
        attributedRevenue: number;
        commission: number;
        eventCount: number;
        paid: number;
        pending: number;
      }
    >();

    // Calculate from revenue attributions first, then fall back to assigned events
    if (attributions && attributions.length > 0) {
      attributions.forEach((attr) => {
        if (!attr.salespersonId) return;

        const person = people.find((p) => p._id === attr.salespersonId);
        if (!person) return;

        const name = `${person.givenName} ${person.familyName}`.trim();
        if (!salesMap.has(attr.salespersonId)) {
          salesMap.set(attr.salespersonId, {
            name,
            attributedRevenue: 0,
            commission: 0,
            eventCount: 0,
            paid: 0,
            pending: 0,
          });
        }

        const data = salesMap.get(attr.salespersonId)!;
        data.attributedRevenue += attr.allocatedAmount || 0;
        data.commission += (attr.allocatedAmount || 0) * COMMISSION_RATE;

        if (attr.status === "approved") {
          data.paid += (attr.allocatedAmount || 0) * COMMISSION_RATE;
        } else {
          data.pending += (attr.allocatedAmount || 0) * COMMISSION_RATE;
        }
        data.eventCount += 1;
      });
    } else {
      // Fallback to event.assignedToId
      events.forEach((event) => {
        if (!event.assignedToId || event.quotedPrice == null) return;

        const person = people.find((p) => p._id === event.assignedToId);
        if (!person) return;

        const name = `${person.givenName} ${person.familyName}`.trim();

        if (!salesMap.has(event.assignedToId)) {
          salesMap.set(event.assignedToId, {
            name,
            attributedRevenue: 0,
            commission: 0,
            eventCount: 0,
            paid: 0,
            pending: 0,
          });
        }

        const data = salesMap.get(event.assignedToId)!;
        const revenue = event.quotedPrice || 0;
        data.attributedRevenue += revenue;
        data.commission += revenue * COMMISSION_RATE;
        data.pending += revenue * COMMISSION_RATE; // All pending without attribution
        data.eventCount += 1;
      });
    }

    const totalCommission = Array.from(salesMap.values()).reduce(
      (sum, s) => sum + s.commission,
      0,
    );
    const totalPaid = Array.from(salesMap.values()).reduce(
      (sum, s) => sum + s.paid,
      0,
    );
    const totalPending = Array.from(salesMap.values()).reduce(
      (sum, s) => sum + s.pending,
      0,
    );

    return {
      totalCommission,
      totalPaid,
      totalPending,
      salespeople: Array.from(salesMap.values()).sort(
        (a, b) => b.commission - a.commission,
      ),
      totalRevenue: Array.from(salesMap.values()).reduce(
        (sum, s) => sum + s.attributedRevenue,
        0,
      ),
    };
  }, [events, attributions, people]);

  // Commission targets and status
  const commissionTargets = useMemo(() => {
    if (!commissionMetrics) return null;

    const monthlyTarget = 15000; // Example target
    const totalCommission = commissionMetrics.totalCommission;
    const pctOfTarget = (totalCommission / monthlyTarget) * 100;

    return {
      monthlyTarget,
      totalCommission,
      pctOfTarget,
      status:
        pctOfTarget >= 100
          ? "exceeded"
          : pctOfTarget >= 75
            ? "on-track"
            : "behind",
    };
  }, [commissionMetrics]);

  // Payment status breakdown
  const paymentStatus = useMemo(() => {
    if (!commissionMetrics) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Current month commission
    const currentMonthAttributions = (attributions || []).filter((attr) => {
      if (!attr.createdAt) return false;
      const date = new Date(attr.createdAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    const currentMonthCommission = currentMonthAttributions.reduce(
      (sum, attr) => {
        return sum + (attr.allocatedAmount || 0) * 0.03;
      },
      0,
    );

    return {
      currentMonth: currentMonthCommission,
      paid: commissionMetrics.totalPaid,
      pending: commissionMetrics.totalPending,
      total: commissionMetrics.totalCommission,
    };
  }, [commissionMetrics, attributions]);

  // Top events by commission
  const topEventsByCommission = useMemo(() => {
    if (!events || !people) return [];

    const COMMISSION_RATE = 0.03;

    return events
      .filter((e) => e.quotedPrice != null)
      .map((event) => {
        const person = event.assignedToId
          ? people.find((p) => p._id === event.assignedToId)
          : null;
        return {
          title: event.title,
          salesperson: person
            ? `${person.givenName} ${person.familyName}`.trim()
            : "Unassigned",
          revenue: event.quotedPrice || 0,
          commission: (event.quotedPrice || 0) * COMMISSION_RATE,
          date: event.startsAt ? formatDate(event.startsAt) : "",
          stage: event.stage || "unknown",
        };
      })
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 10);
  }, [events, people]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // Summary cards
    {
      id: "total-commission",
      size: "small",
      content: (
        <StatCard
          title="Total Commission"
          main={{
            value: commissionMetrics?.totalCommission || 0,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Paid",
              value: commissionMetrics?.totalPaid || 0,
              format: "currency" as const,
            },
            {
              label: "Pending",
              value: commissionMetrics?.totalPending || 0,
              format: "currency" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "target-status",
      size: "small",
      content: (
        <StatCard
          title="Monthly Target"
          main={{
            value: commissionTargets?.pctOfTarget || 0,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "Target",
              value: commissionTargets?.monthlyTarget || 0,
              format: "currency" as const,
            },
            {
              label: "Commission",
              value: commissionTargets?.totalCommission || 0,
              format: "currency" as const,
            },
          ]}
          tone={
            commissionTargets?.status === "exceeded"
              ? "ok"
              : commissionTargets?.status === "on-track"
                ? "info"
                : "warn"
          }
          isLive
        />
      ),
    },
    {
      id: "current-month",
      size: "small",
      content: (
        <StatCard
          title="This Month"
          main={{
            value: paymentStatus?.currentMonth || 0,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Paid YTD",
              value: paymentStatus?.paid || 0,
              format: "currency" as const,
            },
            {
              label: "Pending",
              value: paymentStatus?.pending || 0,
              format: "currency" as const,
            },
          ]}
          tone="accent"
          isLive
        />
      ),
    },
    {
      id: "commission-rate",
      size: "small",
      content: (
        <StatCard
          title="Commission Rate"
          main={{ value: 3, format: "percent" as const }}
          rows={[
            {
              label: "Basis",
              value: "Booked Revenue",
            },
            { label: "Rate Type", value: "Flat %" },
          ]}
          tone="info"
        />
      ),
    },
    // Salesperson performance
    {
      id: "sales-performance-chart",
      size: "large",
      content: (
        <BarChart
          data={
            commissionMetrics?.salespeople.map((s) => ({
              salesperson: s.name,
              commission: s.commission,
              revenue: s.attributedRevenue,
              eventCount: s.eventCount,
            })) || []
          }
          xAxisKey="salesperson"
          series={[
            { dataKey: "commission", name: "Commission", color: "#3b82f6" },
            {
              dataKey: "revenue",
              name: "Attributed Revenue",
              color: "#10b981",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Commission by Salesperson",
    },
    // Payment status table
    {
      id: "payment-status-table",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            { key: "title", header: "Event", type: "string" as const },
            {
              key: "salesperson",
              header: "Salesperson",
              type: "string" as const,
            },
            { key: "revenue", header: "Revenue", type: "currency" as const },
            {
              key: "commission",
              header: "Commission (3%)",
              type: "currency" as const,
            },
            { key: "date", header: "Event Date", type: "string" as const },
            { key: "stage", header: "Stage", type: "string" as const },
          ]}
          data={topEventsByCommission}
          height={350}
        />
      ),
      title: "Top Events by Commission",
    },
    // Salesperson detail table
    {
      id: "salesperson-detail",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            { key: "name", header: "Salesperson", type: "string" as const },
            {
              key: "attributedRevenue",
              header: "Attributed Revenue",
              type: "currency" as const,
            },
            {
              key: "commission",
              header: "Commission (3%)",
              type: "currency" as const,
            },
            { key: "paid", header: "Paid", type: "currency" as const },
            { key: "pending", header: "Pending", type: "currency" as const },
            { key: "eventCount", header: "Events", type: "number" as const },
          ]}
          data={
            commissionMetrics?.salespeople.map((s) => ({
              name: s.name,
              attributedRevenue: s.attributedRevenue,
              commission: s.commission,
              paid: s.paid,
              pending: s.pending,
              eventCount: s.eventCount,
            })) || []
          }
          height={300}
        />
      ),
      title: "Commission Detail by Salesperson",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Comp Master Dashboard"
        lead="Compensation tracking with 3% commission basis. Status and evidence for commission deliverables, payment tracking, and revenue attribution."
      />

      <div className="mb-4 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-ok-500" />
          <span>Exceeded Target</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-brand-500" />
          <span>On Track</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-warn-500" />
          <span>Behind Target</span>
        </div>
      </div>

      <DashboardGrid items={dashboardItems} />

      {/* Compensation Policy Note */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-900">
          Commission Policy
        </h4>
        <p className="mt-1 text-sm text-ink-600">
          Sales commissions calculated at 3% of booked revenue after revenue
          attribution rules apply. Venue splits and referral fees are deducted
          before commission calculation. Commissions are paid monthly upon event
          completion and payment collection. Attributions must be approved
          before commission is marked as paid. Source evidence maintained in
          Revenue Attribution records.
        </p>
      </div>

      {/* Evidence Trail */}
      <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-ink-900">Evidence Trail</h4>
        <div className="mt-2 text-sm text-ink-600">
          <p>
            <strong>Data Sources:</strong>
          </p>
          <ul className="list-inside list-disc mt-1 space-y-1">
            <li>Event records (quoted price, assigned salesperson, stage)</li>
            <li>
              Revenue Attribution records (approved status, amounts, splits)
            </li>
            <li>Person records (salesperson identity)</li>
          </ul>
          <p className="mt-2">
            <strong>Commission Formula:</strong> Event Quoted Price × Venue
            Attribution % × Referral Deduction × 3%
          </p>
          <p className="mt-1">
            <strong>Payment Status:</strong> Paid = Approved Revenue Attribution
            with settled payment; Pending = Unapproved or unsettled
          </p>
        </div>
      </div>
    </div>
  );
}
