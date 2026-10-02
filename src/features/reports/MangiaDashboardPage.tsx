import { useMemo } from "react";
import { useListPrepTask, useListPackList } from "@/lib/manifest-convex-react";
import { useEventsInRange } from "../facilities/useEventsById";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { trendFromSeries } from "@/ui/charts/Sparkline";
import { BarChart } from "@/ui/charts/BarChart";
import { LineChart } from "@/ui/charts/LineChart";
import { EmptyState, PageHeader } from "@/ui/primitives";
import { formatCount } from "@/lib/format";
import {
  COMPLETED_STAGES,
  isBookedEvent,
  percentOf,
  percentText,
} from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";

/**
 * Mangia Dashboard Round 4 (Priority 41)
 *
 * Day-to-day operations board, live from Capsule data: today's events,
 * prep and pack progress, staffing, week-to-date performance, and alerts.
 * Ports the existing Mangia deliverable's measures onto live Capsule data.
 */

export function MangiaDashboardPage() {
  const prepTasks = useListPrepTask();
  const packLists = useListPackList();

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  // The board shows the last seven days and the current Sunday-to-Sunday week.
  const [eventWindow, weekRange] = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 6);
    const dayEnd = new Date(today);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return [
      {
        from: Math.min(weekStart.getTime(), trendStart.getTime()),
        to: Math.max(weekEnd.getTime(), dayEnd.getTime()),
      },
      { from: weekStart.getTime(), to: weekEnd.getTime() },
    ];
  }, [today]);
  const windowEvents = useEventsInRange(eventWindow);
  // The next-event hint only shows in a week with no events, so the events
  // from today onward are read only then.
  const weekIsEmpty =
    windowEvents !== undefined &&
    !windowEvents.some(
      (e) =>
        e.startsAt != null &&
        e.stage !== "cancelled" &&
        e.startsAt >= weekRange.from &&
        e.startsAt < weekRange.to,
    );
  const upcomingEvents = useEventsInRange(
    weekIsEmpty
      ? {
          from: today.getTime(),
          to: new Date(
            today.getFullYear() + 10,
            today.getMonth(),
            today.getDate(),
          ).getTime(),
        }
      : "skip",
  );
  const events = useMemo(
    () =>
      windowEvents === undefined ||
      (weekIsEmpty && upcomingEvents === undefined)
        ? undefined
        : [
            ...windowEvents,
            ...(upcomingEvents ?? []).filter(
              (e) => !windowEvents.some((w) => w._id === e._id),
            ),
          ],
    [windowEvents, upcomingEvents],
  );

  // Today's operations snapshot
  const todaySnapshot = useMemo(() => {
    const todayEvents = (events || []).filter((e) => {
      if (!e.startsAt || e.stage === "cancelled") return false;
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
      completedEvents: todayEvents.filter((e) =>
        COMPLETED_STAGES.includes(e.stage ?? ""),
      ).length,
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
      pctComplete: percentOf(completed, todayPrep.length),
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
      pctReady: percentOf(packed + dispatched, todayPacks.length),
    };
  }, [packLists, today]);

  // Staff status
  const staffStatus = useMemo(() => {
    // Count unique assigned staff for today's events
    const todayEvents = (events || []).filter((e) => {
      if (!e.startsAt || e.stage === "cancelled") return false;
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
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7); // Next Sunday: the whole week, not just to date

    const weekEvents = (events || []).filter((e) => {
      if (!e.startsAt || e.stage === "cancelled") return false;
      const eventDate = new Date(e.startsAt);
      return eventDate >= weekStart && eventDate < weekEnd;
    });

    // Revenue counts booked events only (dashboard.booked_revenue): a quote
    // on the calendar is not money yet.
    const weekBooked = weekEvents.filter(isBookedEvent);
    const weekRevenue = weekBooked.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const weekGuests = weekBooked.reduce(
      (sum, e) => sum + (e.expectedHeadcount || 0),
      0,
    );
    const weekCompleted = weekEvents.filter((e) =>
      COMPLETED_STAGES.includes(e.stage ?? ""),
    ).length;

    // Soonest event from today on, so an empty week still says what is next.
    const nextEvent = (events || [])
      .filter((e) => e.startsAt && new Date(e.startsAt) >= today)
      .sort((a, b) => Number(a.startsAt) - Number(b.startsAt))[0];

    return {
      weekStart,
      weekEnd,
      nextEvent,
      totalEvents: weekEvents.length,
      bookedEvents: weekBooked.length,
      completedEvents: weekCompleted,
      totalRevenue: weekRevenue,
      totalGuests: weekGuests,
      avgEventValue:
        weekBooked.length > 0 ? weekRevenue / weekBooked.length : 0,
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
        message: `${todaySnapshot.executingEvents} events running at the same time`,
      });
    }

    if (packStatus.pctReady != null && packStatus.pctReady < 80) {
      alerts.push({
        severity: "medium",
        message: `Pack lists only ${Math.round(packStatus.pctReady)}% ready`,
      });
    }

    if (weekToDateMetrics.totalEvents === 0) {
      const day = (date: Date) =>
        date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      const lastDay = new Date(weekToDateMetrics.weekEnd);
      lastDay.setDate(lastDay.getDate() - 1);
      const next = weekToDateMetrics.nextEvent;
      alerts.push({
        severity: "low",
        message: `No events this week (${day(weekToDateMetrics.weekStart)} – ${day(lastDay)}). ${
          next?.startsAt
            ? `Next event: ${next.title || "Untitled event"} on ${day(new Date(next.startsAt))}.`
            : "No upcoming events on the calendar."
        }`,
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
        if (!e.startsAt || e.stage === "cancelled") return false;
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
        <div className="rounded-sm border-2 border-brand/30 bg-brand-soft p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-brand">Today's Operations</h3>
              <p className="text-xs text-brand">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-brand">
                {todaySnapshot.totalEvents}
              </p>
              <p className="text-xs text-brand">Events Scheduled</p>
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
          main={{
            label: "Today",
            value: todaySnapshot.totalGuests,
            format: "number" as const,
          }}
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
          trend={trendFromSeries(
            dailyTrendData,
            (day) => day.guests,
            (day) =>
              day === dailyTrendData[dailyTrendData.length - 1]
                ? "Today"
                : day.day,
          )}
        />
      ),
    },
    {
      id: "prep-progress",
      size: "small",
      content: (
        <StatCard
          title="Prep Progress"
          main={{
            label: "Complete",
            value: percentText(prepStatus.pctComplete, "None due today"),
          }}
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
          main={{
            label: "Ready",
            value: percentText(packStatus.pctReady, "None today"),
          }}
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
          tone={
            packStatus.pctReady != null && packStatus.pctReady < 80
              ? "warn"
              : "ok"
          }
          isLive
        />
      ),
    },
    {
      id: "staff-coverage",
      size: "small",
      content: (
        <StatCard
          title="Event owners today"
          main={{
            label: "On-Site",
            value: staffStatus.totalStaff,
            format: "number" as const,
          }}
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
          title="This week's revenue"
          main={{
            label: "This week",
            value: weekToDateMetrics.totalRevenue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Booked events",
              value: weekToDateMetrics.bookedEvents,
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
            { dataKey: "revenue", name: "Revenue", color: "var(--color-info)" },
            { dataKey: "guests", name: "Guests", color: "var(--color-ok)" },
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
          series={[
            { dataKey: "count", name: "Tasks", color: "var(--color-brand)" },
          ]}
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
          series={[
            { dataKey: "count", name: "Lists", color: "var(--color-accent)" },
          ]}
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
        lead="Today's events, prep and pack progress, staffing, and week-to-date performance — the day's operations at a glance."
      />

      {events?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events yet"
            hint="Today's work and this week's events show here once events are booked."
          />
        </div>
      ) : null}

      <DashboardGrid items={dashboardItems} />

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mt-6 rounded-sm border border-line bg-inset p-4">
          <h4 className="text-xs font-semibold text-ink">Needs Attention</h4>
          <div className="mt-2 space-y-1">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`rounded-xs px-2 py-1 text-xs ${
                  alert.severity === "high"
                    ? "bg-danger-soft text-danger"
                    : alert.severity === "medium"
                      ? "bg-warn-soft text-warn"
                      : "bg-info-soft text-info"
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          How to read this board
        </h4>
        <div className="mt-2 grid grid-cols-4 gap-4 text-xs text-ink-2">
          <div>
            <p className="font-medium text-ink">Today</p>
            <p>What's happening right now</p>
          </div>
          <div>
            <p className="font-medium text-ink">Week</p>
            <p>How the week is going so far</p>
          </div>
          <div>
            <p className="font-medium text-ink">Status</p>
            <p>Prep, pack, and staffing progress</p>
          </div>
          <div>
            <p className="font-medium text-ink">Needs attention</p>
            <p>Anything that could hold up an event</p>
          </div>
        </div>
      </div>

      <MetricDefinitionList
        metricIds={[
          "dashboard.events_today",
          "dashboard.guests_today",
          "dashboard.prep_done_today",
          "dashboard.packs_ready",
          "dashboard.event_owners_today",
          "dashboard.booked_revenue",
        ]}
      />
    </div>
  );
}
