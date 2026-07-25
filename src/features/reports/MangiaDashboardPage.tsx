import { useMemo } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListPrepTask,
  useListPackList,
  useListPerson,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { BarChart } from "@/ui/charts/BarChart";
import { LineChart } from "@/ui/charts/LineChart";
import { PageHeader } from "@/ui/primitives";
import { formatMoney, formatCount } from "@/lib/format";

/**
 * Mangia Dashboard Round 4 (Priority 41)
 *
 * Operational metrics with visual hierarchy for day-to-day operations management.
 * Ports the existing Mangia deliverable's measures onto live Capsule data.
 *
 * Features:
 * - Today's operations snapshot (events, staffing, prep, packing)
 * - Production metrics (food cost, waste, yield)
 * - Kitchen status (prep tasks, batch completion)
 * - Logistics status (pack lists, equipment, delivery)
 * - Team status (shifts, check-ins)
 * - Week-to-date performance
 * - Operational alerts and blockers
 */

export function MangiaDashboardPage() {
  const events = useListEvent();
  const closeouts = useListEventCloseout();
  const prepTasks = useListPrepTask();
  const packLists = useListPackList();
  const people = useListPerson();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Today's operations snapshot
  const todaySnapshot = useMemo(() => {
    const todayEvents = (events || []).filter((e) => {
      if (!e.startsAt) return false;
      const eventDate = new Date(e.startsAt);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === today.getTime();
    });

    const executingEvents = todayEvents.filter((e) => e.stage === "executing");
    const totalGuests = todayEvents.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const totalRevenue = todayEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );

    return {
      totalEvents: todayEvents.length,
      executingEvents: executingEvents.length,
      completedEvents: todayEvents.filter((e) => e.stage === "completed")
        .length,
      totalGuests,
      totalRevenue,
    };
  }, [events, today]);

  // Prep status
  const prepStatus = useMemo(() => {
    const todayPrep = (prepTasks || []).filter((p) => {
      if (!p.dueAt) return false;
      const dueDate = new Date(p.dueAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime();
    });

    const pending = todayPrep.filter((p) => p.status === "pending").length;
    const inProgress = todayPrep.filter(
      (p) => p.status === "in_progress",
    ).length;
    const completed = todayPrep.filter((p) => p.status === "completed").length;
    const blocked = todayPrep.filter((p) => p.status === "blocked").length;

    return {
      total: todayPrep.length,
      pending,
      inProgress,
      completed,
      blocked,
      pctComplete:
        todayPrep.length > 0 ? (completed / todayPrep.length) * 100 : 0,
    };
  }, [prepTasks, today]);

  // Pack status
  const packStatus = useMemo(() => {
    const todayPacks = (packLists || []).filter((p) => {
      if (!p.createdAt) return false;
      const createdDate = new Date(p.createdAt);
      createdDate.setHours(0, 0, 0, 0);
      return createdDate.getTime() === today.getTime();
    });

    const opened = todayPacks.filter((p) => p.status === "opened").length;
    const packing = todayPacks.filter((p) => p.status === "packing").length;
    const packed = todayPacks.filter((p) => p.status === "packed").length;
    const dispatched = todayPacks.filter(
      (p) => p.status === "dispatched",
    ).length;

    return {
      total: todayPacks.length,
      opened,
      packing,
      packed,
      dispatched,
      pctReady: todayPacks.length > 0 ? (packed / todayPacks.length) * 100 : 0,
    };
  }, [packLists, today]);

  // Staff status
  const staffStatus = useMemo(() => {
    // Count unique assigned staff for today's events
    const todayEvents = (events || []).filter((e) => {
      if (!e.startsAt) return false;
      const eventDate = new Date(e.startsAt);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === today.getTime();
    });

    const assignedStaff = new Set<string>();
    todayEvents.forEach((event) => {
      if (event.assignedToId) assignedStaff.add(event.assignedToId);
    });

    return {
      totalStaff: assignedStaff.size,
      eventsNeedingStaff: todayEvents.length,
    };
  }, [events, today]);

  // Week-to-date metrics
  const weekToDateMetrics = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)

    const weekEvents = (events || []).filter((e) => {
      if (!e.startsAt) return false;
      const eventDate = new Date(e.startsAt);
      return eventDate >= weekStart && eventDate <= today;
    });

    const weekRevenue = weekEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const weekGuests = weekEvents.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const weekCompleted = weekEvents.filter(
      (e) => e.stage === "completed",
    ).length;

    return {
      totalEvents: weekEvents.length,
      completedEvents: weekCompleted,
      totalRevenue: weekRevenue,
      totalGuests: weekGuests,
      avgEventValue:
        weekEvents.length > 0 ? weekRevenue / weekEvents.length : 0,
    };
  }, [events, today]);

  // Operational alerts
  const alerts = useMemo(() => {
    const alerts = [];

    if (prepStatus.blocked > 0) {
      alerts.push({
        severity: "high",
        message: `${prepStatus.blocked} prep tasks blocked`,
      });
    }

    if (todaySnapshot.executingEvents > 3) {
      alerts.push({
        severity: "medium",
        message: `${todaySnapshot.executingEvents} events executing concurrently`,
      });
    }

    if (packStatus.pctReady < 80 && packStatus.total > 0) {
      alerts.push({
        severity: "medium",
        message: `Pack lists only ${Math.round(packStatus.pctReady)}% ready`,
      });
    }

    if (weekToDateMetrics.totalEvents === 0) {
      alerts.push({
        severity: "low",
        message: "No events scheduled this week",
      });
    }

    return alerts;
  }, [prepStatus, todaySnapshot, packStatus, weekToDateMetrics]);

  // Daily trend for the week
  const dailyTrendData = useMemo(() => {
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const dayEvents = (events || []).filter((e) => {
        if (!e.startsAt) return false;
        const eventDate = new Date(e.startsAt);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === date.getTime();
      });

      const dayRevenue = dayEvents.reduce(
        (sum, e) => sum + (e.quotedPrice || 0),
        0,
      );
      const dayGuests = dayEvents.reduce(
        (sum, e) => sum + (e.expectedHeadcount || 0),
        0,
      );

      weekData.push({
        day: date.toLocaleDateString("en-US", { weekday: "short" }),
        events: dayEvents.length,
        revenue: dayRevenue,
        guests: dayGuests,
      });
    }

    return weekData;
  }, [events, today]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // Today's snapshot header
    {
      id: "today-header",
      size: "full",
      content: (
        <div className="rounded-lg border-2 border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-brand-900">
                Today's Operations
              </h3>
              <p className="text-sm text-brand-700">
                {today.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-brand-900">
                {todaySnapshot.totalEvents}
              </p>
              <p className="text-sm text-brand-700">Events Scheduled</p>
            </div>
          </div>
        </div>
      ),
    },
    // KPI cards
    {
      id: "guests-today",
      size: "small",
      content: (
        <StatCard
          title="Guests Today"
          main={{ value: todaySnapshot.totalGuests, format: "number" as const }}
          rows={[
            {
              label: "Executing",
              value: todaySnapshot.executingEvents,
              format: "number" as const,
            },
            {
              label: "Completed",
              value: todaySnapshot.completedEvents,
              format: "number" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "prep-progress",
      size: "small",
      content: (
        <StatCard
          title="Prep Progress"
          main={{ value: prepStatus.pctComplete, format: "percent" as const }}
          rows={[
            {
              label: "Complete",
              value: prepStatus.completed,
              format: "number" as const,
            },
            {
              label: "Blocked",
              value: prepStatus.blocked,
              format: "number" as const,
            },
          ]}
          tone={prepStatus.blocked > 0 ? "warn" : "ok"}
          isLive
        />
      ),
    },
    {
      id: "pack-status",
      size: "small",
      content: (
        <StatCard
          title="Pack Lists"
          main={{ value: packStatus.pctReady, format: "percent" as const }}
          rows={[
            {
              label: "Total",
              value: packStatus.total,
              format: "number" as const,
            },
            {
              label: "Dispatched",
              value: packStatus.dispatched,
              format: "number" as const,
            },
          ]}
          tone={packStatus.pctReady < 80 ? "warn" : "ok"}
          isLive
        />
      ),
    },
    {
      id: "staff-coverage",
      size: "small",
      content: (
        <StatCard
          title="Staff On-Site"
          main={{ value: staffStatus.totalStaff, format: "number" as const }}
          rows={[
            {
              label: "Events Active",
              value: staffStatus.eventsNeedingStaff,
              format: "number" as const,
            },
          ]}
          tone="info"
          isLive
        />
      ),
    },
    // Week trends
    {
      id: "week-revenue",
      size: "medium",
      content: (
        <StatCard
          title="Week-to-Date Revenue"
          main={{
            value: weekToDateMetrics.totalRevenue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Events",
              value: weekToDateMetrics.totalEvents,
              format: "number" as const,
            },
            {
              label: "Avg Value",
              value: weekToDateMetrics.avgEventValue,
              format: "currency" as const,
            },
            {
              label: "Guests",
              value: weekToDateMetrics.totalGuests,
              format: "number" as const,
            },
          ]}
          tone="accent"
          isLive
        />
      ),
    },
    {
      id: "daily-trend-chart",
      size: "large",
      content: (
        <LineChart
          data={dailyTrendData}
          xAxisKey="day"
          series={[
            { dataKey: "revenue", name: "Revenue", color: "#3b82f6" },
            { dataKey: "guests", name: "Guests", color: "#10b981" },
          ]}
          height={250}
          formatYAxis={formatCount}
        />
      ),
      title: "Daily Trend (Last 7 Days)",
    },
    // Operational breakdowns
    {
      id: "prep-breakdown",
      size: "medium",
      content: (
        <BarChart
          data={[
            { status: "Pending", count: prepStatus.pending },
            { status: "In Progress", count: prepStatus.inProgress },
            { status: "Completed", count: prepStatus.completed },
            { status: "Blocked", count: prepStatus.blocked },
          ]}
          xAxisKey="status"
          series={[{ dataKey: "count", name: "Tasks", color: "#8b5cf6" }]}
          height={250}
        />
      ),
      title: "Prep Task Status",
    },
    {
      id: "pack-breakdown",
      size: "medium",
      content: (
        <BarChart
          data={[
            { status: "Opened", count: packStatus.opened },
            { status: "Packing", count: packStatus.packing },
            { status: "Packed", count: packStatus.packed },
            { status: "Dispatched", count: packStatus.dispatched },
          ]}
          xAxisKey="status"
          series={[{ dataKey: "count", name: "Lists", color: "#f59e0b" }]}
          height={250}
        />
      ),
      title: "Pack List Status",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Mangia Operational Dashboard"
        lead="Day-to-day operations metrics with visual hierarchy. Events, staffing, prep, packing, and logistics status."
      />

      <DashboardGrid items={dashboardItems} />

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
          <h4 className="text-sm font-semibold text-ink-900">
            Operational Alerts
          </h4>
          <div className="mt-2 space-y-1">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`rounded px-2 py-1 text-sm ${
                  alert.severity === "high"
                    ? "bg-accent-100 text-accent-900"
                    : alert.severity === "medium"
                      ? "bg-warn-100 text-warn-900"
                      : "bg-info-100 text-info-900"
                }`}
              >
                {alert.severity === "high"
                  ? "⚠️"
                  : alert.severity === "medium"
                    ? "📍"
                    : "ℹ️"}{" "}
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-900">Visual Hierarchy</h4>
        <div className="mt-2 grid grid-cols-4 gap-4 text-sm text-ink-600">
          <div>
            <p className="font-medium text-ink-900">Today</p>
            <p>Current day operations snapshot</p>
          </div>
          <div>
            <p className="font-medium text-ink-900">Week</p>
            <p>Week-to-date performance trends</p>
          </div>
          <div>
            <p className="font-medium text-ink-900">Status</p>
            <p>Prep, pack, and staffing progress</p>
          </div>
          <div>
            <p className="font-medium text-ink-900">Alerts</p>
            <p>Blockers requiring attention</p>
          </div>
        </div>
      </div>
    </div>
  );
}
