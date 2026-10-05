import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useListLead,
  useListEventCloseout,
  useListLeadershipItem,
  useListPerson,
  useListScorecardTarget,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { StatCard } from "@/ui/charts/StatCard";
import { PageHeader, Section, EmptyState } from "@/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { FINANCE_ROUTES } from "../finance/financeRoutes";
import {
  NOT_KNOWN,
  foodCostPercent,
  isBookedEvent,
  isCompletedEvent,
  percentText,
} from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";
import {
  SCORECARD_STATUS_LABEL,
  formatScorecardValue,
  scorecardRows,
  type ScorecardTargetRow,
} from "./scorecardMeasures";
import {
  weekStartOf,
  weeklyHistory,
  type LeadershipItemRow,
} from "./leadershipHistory";
import { useEventsInRange } from "../facilities/useEventsById";
import { LeadershipItemsPanel } from "./LeadershipItemsPanel";
import type { ScorecardPerson } from "./ScorecardTargetEditor";

/**
 * L10 Dashboard (Priority 40)
 *
 * Weekly leadership meeting board: this week's wins, the company scorecard
 * against its targets and owners, the priorities (rocks), issues and to-dos
 * (LeadershipItem), and eight weeks of meeting history, all live.
 */

export function L10DashboardPage() {
  const now = useMemo(() => new Date(), []);
  // Every figure here is this month or one of the last eight weeks.
  const eventWindow = useMemo(() => {
    const week = weekStartOf(now);
    const from = Math.min(
      new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      new Date(
        week.getFullYear(),
        week.getMonth(),
        week.getDate() - 49,
      ).getTime(),
    );
    const to = Math.max(
      new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
      new Date(
        week.getFullYear(),
        week.getMonth(),
        week.getDate() + 7,
      ).getTime(),
    );
    return { from, to };
  }, [now]);
  const events = useEventsInRange(eventWindow);
  const leads = useListLead();
  const closeouts = useListEventCloseout();
  const items = useListLeadershipItem();
  const targets = useListScorecardTarget();
  const people = useListPerson();

  const activePeople: ScorecardPerson[] = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const personName = (id: string | null | undefined) => {
    const person = id ? people?.find((row) => row._id === id) : undefined;
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "No owner";
  };

  const scorecard = useMemo(
    () =>
      scorecardRows(
        {
          events: events ?? [],
          closeouts: closeouts ?? [],
          leads: leads ?? [],
        },
        (targets ?? []) as ScorecardTargetRow[],
        now,
      ),
    [events, closeouts, leads, targets, now],
  );

  const history = useMemo(
    () =>
      weeklyHistory(
        {
          items: (items ?? []) as LeadershipItemRow[],
          events: events ?? [],
          leads: leads ?? [],
        },
        now,
      ),
    [items, events, leads, now],
  );

  // This week's wins
  const weeklyWins = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCompleted = (events || []).filter((e) => {
      if (!e.startsAt || !isCompletedEvent(e)) return false;
      const starts = new Date(e.startsAt);
      return starts >= weekAgo && starts <= now;
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
      if (!e.startsAt || !isBookedEvent(e)) return false;
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

    const foodCostPct = foodCostPercent(monthCloseouts);

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
        <div className="rounded-sm border-2 border-ok/30 bg-ok-soft p-4">
          <h3 className="font-semibold text-ok">This Week's Wins</h3>
          <div className="mt-3 grid grid-cols-4 gap-4">
            <div>
              <p className="text-xl font-bold text-ok">
                {weeklyWins.completedEvents}
              </p>
              <p className="text-xs text-ok">Events Completed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">
                {formatMoney(weeklyWins.revenue)}
              </p>
              <p className="text-xs text-ok">Completed revenue</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">{weeklyWins.newLeads}</p>
              <p className="text-xs text-ok">New Leads</p>
            </div>
            <div>
              <p className="text-xl font-bold text-ok">
                {weeklyWins.convertedLeads}
              </p>
              <p className="text-xs text-ok">Converted</p>
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
            value: percentText(scorecardMetrics.foodCostPct),
          }}
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
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="L10 Meeting Dashboard"
        lead="Your weekly leadership meeting: this week's wins, the scorecard against its targets, priorities, issues, to-dos, and the last eight weeks."
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

      <div className="mt-6">
        <Section title="Scorecard">
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="l10-scorecard">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Target</th>
                  <th>This month</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.map((row) => (
                  <tr key={row.measure.key}>
                    <td>{row.measure.name}</td>
                    <td>
                      {row.target
                        ? formatScorecardValue(
                            row.target.target,
                            row.measure.unit,
                          )
                        : "Not set"}
                    </td>
                    <td>
                      {row.actual == null
                        ? NOT_KNOWN
                        : formatScorecardValue(row.actual, row.measure.unit)}
                    </td>
                    <td>{personName(row.target?.ownerPersonId)}</td>
                    <td>{SCORECARD_STATUS_LABEL[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-2">
            Set targets and owners on the{" "}
            <Link to={FINANCE_ROUTES.scorecard} className="btn-link">
              Company Scorecard
            </Link>
            .
          </p>
        </Section>
      </div>

      <LeadershipItemsPanel
        items={(items ?? []) as LeadershipItemRow[]}
        people={activePeople}
        now={now}
      />

      <div className="mt-6">
        <Section title="Meeting history (last 8 weeks)">
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="l10-history">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Added</th>
                  <th>Done</th>
                  <th>Dropped</th>
                  <th>Events completed</th>
                  <th>Completed revenue</th>
                  <th>New leads</th>
                </tr>
              </thead>
              <tbody>
                {history.map((week) => (
                  <tr key={week.weekStart}>
                    <td>{formatDate(week.weekStart)}</td>
                    <td>{week.opened}</td>
                    <td>{week.done}</td>
                    <td>{week.dropped}</td>
                    <td>{week.completedEvents}</td>
                    <td>{formatMoney(week.completedRevenue)}</td>
                    <td>{week.newLeads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* L10 Framework Note */}
      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">About L10 Meetings</h4>
        <p className="mt-1 text-xs text-ink-2">
          The L10 is a weekly 90-minute leadership meeting to review the
          business, solve issues, and stay aligned on priorities. Scorecard
          numbers track business health, and wins open the meeting on what went
          right this week.
        </p>
      </div>

      <MetricDefinitionList
        metricIds={[
          "dashboard.events_completed_week",
          "dashboard.leads",
          "dashboard.leads_converted_week",
          "dashboard.booked_revenue",
          "dashboard.booked_events",
          "dashboard.food_cost_percent",
        ]}
      />
    </div>
  );
}
