import { useMemo } from "react";
import {
  useListEvent,
  useListLead,
  useListEventCloseout,
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
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatCount,
} from "@/lib/format";

/**
 * L10 Dashboard (Priority 40)
 *
 * Entrepreneurial Operating System (EOS) L10 meeting metrics.
 * Scorecard, rocks/priorities, issues, action items, and meeting-period history.
 *
 * Features:
 * - Company scorecard metrics
 * - Rocks/priorities tracking with deadlines
 * - Issues list with severity
 * - Action items with owners and due dates
 * - Weekly meeting period history
 * - To-do list status
 * - Headlines and wins celebration
 */

// Simulated data for L10-specific items (rocks, issues, todos)
// In production, these would come from dedicated entities
const MOCK_ROCKS = [
  {
    title: "Launch catering CRM",
    owner: "Sarah",
    deadline: "2026-09-30",
    status: "on-track",
  },
  {
    title: "Hire 2 senior chefs",
    owner: "Marco",
    deadline: "2026-08-15",
    status: "behind",
  },
  {
    title: "Open second venue",
    owner: "James",
    deadline: "2026-12-31",
    status: "on-track",
  },
  {
    title: "Implement inventory system",
    owner: "Lisa",
    deadline: "2026-07-31",
    status: "complete",
  },
];

const MOCK_ISSUES = [
  {
    title: "Kitchen equipment delay",
    severity: "high",
    owner: "Marco",
    age: 14,
  },
  { title: "Venue AC malfunction", severity: "high", owner: "James", age: 3 },
  {
    title: "Staffing shortage weekends",
    severity: "medium",
    owner: "Sarah",
    age: 28,
  },
  {
    title: "Food cost variance over 32%",
    severity: "medium",
    owner: "Marco",
    age: 7,
  },
];

const MOCK_TODOS = [
  {
    task: "Review weekly financials",
    owner: "CFO",
    due: "2026-07-28",
    status: "done",
  },
  {
    task: "Update sales pipeline",
    owner: "Sales Director",
    due: "2026-07-28",
    status: "done",
  },
  {
    task: "Approve vendor contracts",
    owner: "Ops Director",
    due: "2026-07-29",
    status: "pending",
  },
  {
    task: "Schedule team training",
    owner: "HR Manager",
    due: "2026-07-30",
    status: "pending",
  },
];

export function L10DashboardPage() {
  const events = useListEvent();
  const leads = useListLead();
  const closeouts = useListEventCloseout();
  const people = useListPerson();

  // This week's wins
  const weeklyWins = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCompleted = (events || []).filter((e) => {
      if (!e.updatedAt) return false;
      const updated = new Date(e.updatedAt);
      return e.stage === "completed" && updated >= weekAgo && updated <= now;
    });

    const revenueWin = recentCompleted.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );
    const newLeads = (leads || []).filter((l) => {
      if (!l.createdAt) return false;
      const created = new Date(l.createdAt);
      return created >= weekAgo && created <= now;
    }).length;

    const convertedLeads = (leads || []).filter((l) => {
      if (!l.updatedAt) return false;
      const updated = new Date(l.updatedAt);
      return l.stage === "converted" && updated >= weekAgo && updated <= now;
    }).length;

    return {
      completedEvents: recentCompleted.length,
      revenue: revenueWin,
      newLeads,
      convertedLeads,
    };
  }, [events, leads]);

  // Scorecard metrics (key L10 KPIs)
  const scorecardMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthEvents = (events || []).filter((e) => {
      if (!e.startsAt) return false;
      const date = new Date(e.startsAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    const monthRevenue = monthEvents.reduce(
      (sum, e) => sum + (e.quotedPrice || 0),
      0,
    );

    const monthCloseouts = (closeouts || []).filter((c) => {
      const ts = c.finalizedAt ?? c.capturedAt ?? c.createdAt;
      if (!ts) return false;
      const date = new Date(ts);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    const totalCost = monthCloseouts.reduce(
      (sum, c) => sum + (c.actualIngredientCost || 0),
      0,
    );
    const totalRev = monthCloseouts.reduce(
      (sum, c) => sum + c.grossProfit + (c.actualIngredientCost || 0),
      0,
    );
    const foodCostPct = totalRev > 0 ? (totalCost / totalRev) * 100 : 0;

    const monthLeads = (leads || []).filter((l) => {
      if (!l.createdAt) return false;
      const date = new Date(l.createdAt);
      return (
        date.getMonth() === currentMonth && date.getFullYear() === currentYear
      );
    });

    return {
      monthlyRevenue: monthRevenue,
      foodCostPct,
      newLeads: monthLeads.length,
      eventsBooked: monthEvents.length,
    };
  }, [events, closeouts, leads]);

  // Rock status summary
  const rockSummary = useMemo(() => {
    return {
      total: MOCK_ROCKS.length,
      complete: MOCK_ROCKS.filter((r) => r.status === "complete").length,
      onTrack: MOCK_ROCKS.filter((r) => r.status === "on-track").length,
      behind: MOCK_ROCKS.filter((r) => r.status === "behind").length,
    };
  }, []);

  // Issue summary
  const issueSummary = useMemo(() => {
    return {
      total: MOCK_ISSUES.length,
      high: MOCK_ISSUES.filter((i) => i.severity === "high").length,
      medium: MOCK_ISSUES.filter((i) => i.severity === "medium").length,
      low: MOCK_ISSUES.filter((i) => i.severity === "low").length,
    };
  }, []);

  // To-do summary
  const todoSummary = useMemo(() => {
    return {
      total: MOCK_TODOS.length,
      done: MOCK_TODOS.filter((t) => t.status === "done").length,
      pending: MOCK_TODOS.filter((t) => t.status === "pending").length,
      overdue: MOCK_TODOS.filter((t) => {
        const due = new Date(t.due);
        return t.status !== "done" && due < new Date();
      }).length,
    };
  }, []);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    // Weekly wins
    {
      id: "wins-header",
      size: "full",
      content: (
        <div className="rounded-lg border-2 border-ok-200 bg-ok-50 p-4">
          <h3 className="font-semibold text-ok-900">🎉 This Week's Wins</h3>
          <div className="mt-3 grid grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-ok-900">
                {weeklyWins.completedEvents}
              </p>
              <p className="text-sm text-ok-700">Events Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok-900">
                {formatMoney(weeklyWins.revenue)}
              </p>
              <p className="text-sm text-ok-700">Revenue Booked</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok-900">
                {weeklyWins.newLeads}
              </p>
              <p className="text-sm text-ok-700">New Leads</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok-900">
                {weeklyWins.convertedLeads}
              </p>
              <p className="text-sm text-ok-700">Converted</p>
            </div>
          </div>
        </div>
      ),
    },
    // Scorecard metrics
    {
      id: "monthly-revenue-kpi",
      size: "small",
      content: (
        <StatCard
          title="Monthly Revenue"
          main={{
            value: scorecardMetrics.monthlyRevenue,
            format: "currency" as const,
          }}
          rows={[
            {
              label: "Events Booked",
              value: scorecardMetrics.eventsBooked,
              format: "number" as const,
            },
          ]}
          tone="brand"
          isLive
        />
      ),
    },
    {
      id: "food-cost-kpi",
      size: "small",
      content: (
        <StatCard
          title="Food Cost %"
          main={{
            value: scorecardMetrics.foodCostPct,
            format: "percent" as const,
          }}
          rows={[
            {
              label: "Target: ≤30%",
              value:
                scorecardMetrics.foodCostPct <= 30 ? "On Target" : "Off Target",
            },
          ]}
          tone={scorecardMetrics.foodCostPct <= 30 ? "ok" : "warn"}
          isLive
        />
      ),
    },
    {
      id: "leads-kpi",
      size: "small",
      content: (
        <StatCard
          title="New Leads"
          main={{ value: scorecardMetrics.newLeads, format: "number" as const }}
          tone="info"
          isLive
        />
      ),
    },
    // Rocks summary
    {
      id: "rocks-summary",
      size: "medium",
      content: (
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="font-semibold text-ink-900">Rocks / Priorities</h3>
          <div className="mt-3 flex items-center justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-ink-900">
                {rockSummary.total}
              </p>
              <p className="text-xs text-ink-600">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok-600">
                {rockSummary.complete}
              </p>
              <p className="text-xs text-ink-600">Complete</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-600">
                {rockSummary.onTrack}
              </p>
              <p className="text-xs text-ink-600">On Track</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warn-600">
                {rockSummary.behind}
              </p>
              <p className="text-xs text-ink-600">Behind</p>
            </div>
          </div>
        </div>
      ),
    },
    // Issues summary
    {
      id: "issues-summary",
      size: "medium",
      content: (
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="font-semibold text-ink-900">Issues</h3>
          <div className="mt-3 flex items-center justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-ink-900">
                {issueSummary.total}
              </p>
              <p className="text-xs text-ink-600">Open</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-600">
                {issueSummary.high}
              </p>
              <p className="text-xs text-ink-600">High</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-warn-600">
                {issueSummary.medium}
              </p>
              <p className="text-xs text-ink-600">Medium</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-600">
                {issueSummary.low}
              </p>
              <p className="text-xs text-ink-600">Low</p>
            </div>
          </div>
        </div>
      ),
    },
    // To-do summary
    {
      id: "todos-summary",
      size: "medium",
      content: (
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="font-semibold text-ink-900">To-Dos</h3>
          <div className="mt-3 flex items-center justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-ink-900">
                {todoSummary.total}
              </p>
              <p className="text-xs text-ink-600">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ok-600">
                {todoSummary.done}
              </p>
              <p className="text-xs text-ink-600">Done</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-600">
                {todoSummary.pending}
              </p>
              <p className="text-xs text-ink-600">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-600">
                {todoSummary.overdue}
              </p>
              <p className="text-xs text-ink-600">Overdue</p>
            </div>
          </div>
        </div>
      ),
    },
    // Rocks table
    {
      id: "rocks-table",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            {
              key: "title",
              header: "Rock / Priority",
              type: "string" as const,
            },
            { key: "owner", header: "Owner", type: "string" as const },
            { key: "deadline", header: "Deadline", type: "string" as const },
            { key: "status", header: "Status", type: "string" as const },
          ]}
          data={MOCK_ROCKS.map((r) => ({
            title: r.title,
            owner: r.owner,
            deadline: formatDate(new Date(r.deadline).getTime()),
            status:
              r.status === "complete"
                ? "✓ Complete"
                : r.status === "on-track"
                  ? "→ On Track"
                  : "⚠ Behind",
          }))}
          height={200}
        />
      ),
      title: "Company Rocks / Priorities",
    },
    // Issues table
    {
      id: "issues-table",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            { key: "title", header: "Issue", type: "string" as const },
            { key: "severity", header: "Severity", type: "string" as const },
            { key: "owner", header: "Owner", type: "string" as const },
            { key: "age", header: "Days Open", type: "number" as const },
          ]}
          data={MOCK_ISSUES.map((i) => ({
            title: i.title,
            severity:
              i.severity === "high"
                ? "🔴 High"
                : i.severity === "medium"
                  ? "🟡 Medium"
                  : "🟢 Low",
            owner: i.owner,
            age: i.age,
          }))}
          height={200}
        />
      ),
      title: "Issues List",
    },
    // To-dos table
    {
      id: "todos-table",
      size: "full",
      content: (
        <TableDisplay
          columns={[
            { key: "task", header: "To-Do", type: "string" as const },
            { key: "owner", header: "Owner", type: "string" as const },
            { key: "due", header: "Due Date", type: "string" as const },
            { key: "status", header: "Status", type: "string" as const },
          ]}
          data={MOCK_TODOS.map((t) => ({
            task: t.task,
            owner: t.owner,
            due: formatDate(new Date(t.due).getTime()),
            status:
              t.status === "done"
                ? "✓ Done"
                : new Date(t.due) < new Date() && t.status !== "done"
                  ? "⚠ Overdue"
                  : "→ Pending",
          }))}
          height={200}
        />
      ),
      title: "To-Do List",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="L10 Meeting Dashboard"
        lead="Entrepreneurial Operating System (EOS) L10 metrics: Scorecard, Rocks, Issues, To-Dos, and weekly wins."
      />

      <DashboardGrid items={dashboardItems} />

      {/* L10 Framework Note */}
      <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-900">
          About L10 Meetings
        </h4>
        <p className="mt-1 text-sm text-ink-600">
          The L10 is a weekly 90-minute meeting for leadership to review the
          business, solve issues, and stay aligned on priorities. Scorecard
          metrics track business health. Rocks are 90-day priorities that move
          the company forward. Issues are resolved using the IDS method
          (Identify, Discuss, Solve). To-Dos are commitments with clear owners
          and due dates.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          <strong>Meeting cadence:</strong> Weekly every Monday at 9am.{" "}
          <strong>Attendees:</strong> Leadership team.
          <strong>Duration:</strong> 90 minutes max.
        </p>
      </div>
    </div>
  );
}
