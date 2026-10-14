import { useMemo } from "react";
import { MergedSection } from "@/ui/MergedSection";
import { CompanyScorecardDashboardPage } from "./CompanyScorecardDashboardPage";
import { Link, useSearchParams } from "react-router-dom";
import { L10MeetingRunner, useL10Meeting } from "../eos/L10MeetingRunner";
import {
  useListLeadershipItem,
  useListLeadershipMeeting,
  useListPerson,
  useListScorecardTarget,
} from "@/lib/manifest-convex-react";
import { PageHeader, EmptyState, StatusChip } from "@/ui/primitives";
import { EosPanel } from "../eos/EosShared";
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
  type LeadershipMeetingRow,
} from "./leadershipHistory";
import { useEventsInRange } from "../facilities/useEventsById";
import {
  useCloseoutsInRange,
  useLeadsInRange,
} from "@/lib/financeScopedQueries";
import { LeadershipItemsPanel } from "./LeadershipItemsPanel";
import { L10AgendaSection } from "./L10AgendaSection";
import { L10MeetingRating } from "./L10MeetingRating";
import { useScorecardSources } from "./useScorecardSources";
import { PERIOD_NAME } from "./scorecardPeriods";
import type { ScorecardPerson } from "./ScorecardTargetEditor";

/**
 * L10 Dashboard (Priority 40)
 *
 * Weekly leadership meeting board, in the running order of the owner's L10
 * meeting sheet: the agenda and rules, this week's wins, the company
 * scorecard against its targets and owners, the priorities (rocks) with this
 * week's mark, client and people headlines, issues and to-dos
 * (LeadershipItem), the meeting's rating (LeadershipMeeting), and eight weeks
 * of meeting history, all live.
 */

export function L10DashboardPage() {
  const now = useMemo(() => new Date(), []);
  const [params, setParams] = useSearchParams();
  const meeting = useL10Meeting(params.get("meeting") === "1");
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
  // Leads and closeouts of the same weeks and months, and the leads' proposals.
  const { leads, proposals } = useLeadsInRange(eventWindow);
  const closeouts = useCloseoutsInRange(eventWindow);
  const items = useListLeadershipItem();
  const meetings = useListLeadershipMeeting();
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

  // The same rows the Company Scorecard counts, so the two pages agree.
  const { sources: scorecardSources } = useScorecardSources(now);
  const scorecard = useMemo(
    () =>
      scorecardRows(
        scorecardSources,
        (targets ?? []) as ScorecardTargetRow[],
        now,
      ),
    [scorecardSources, targets, now],
  );

  const history = useMemo(
    () =>
      weeklyHistory(
        {
          items: (items ?? []) as LeadershipItemRow[],
          events: events ?? [],
          leads: leads ?? [],
          meetings: (meetings ?? []) as LeadershipMeetingRow[],
        },
        now,
      ),
    [items, events, leads, meetings, now],
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

    // Counted in the week the client accepted the lead's proposal.
    const acceptedAt = new Map(
      (proposals ?? [])
        .filter((p) => p.status === "accepted" && p.acceptedAt != null)
        .map((p) => [String(p._id), Number(p.acceptedAt)]),
    );
    const convertedLeads = (leads || []).filter((l) => {
      const at = l.proposalId ? acceptedAt.get(String(l.proposalId)) : null;
      if (at == null) return false;
      const when = new Date(at);
      return when >= weekAgo && when <= now;
    }).length;

    return {
      completedEvents: recentCompleted.length,
      revenue: revenueWin,
      newLeads,
      convertedLeads,
    };
  }, [events, leads, proposals]);

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

  const STATUS_TONE: Record<string, string> = {
    on_track: "chip-tone-ok",
    caution: "chip-tone-warn",
    off_track: "chip-tone-danger",
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        eyebrow="EOS · Traction"
        title="L10 meeting"
        lead="The weekly leadership meeting, in agenda order: wins, scorecard, Rocks, headlines, issues, to-dos and the rating. Start meeting mode to run it with a timer."
        actions={
          meeting.state ? null : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={meeting.start}
            >
              Start meeting
            </button>
          )
        }
      />

      {meeting.state ? (
        <L10MeetingRunner
          state={meeting.state}
          go={meeting.go}
          end={() => {
            meeting.end();
            setParams(
              (current) => {
                current.delete("meeting");
                return current;
              },
              { replace: true },
            );
          }}
        />
      ) : (
        <L10AgendaSection />
      )}

      {events?.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events yet"
            hint="The figures fill in as events are booked and completed."
          />
        </div>
      ) : null}

      <div id="wins" className="mt-5 scroll-mt-48">
        <EosPanel
          tone="data"
          eyebrow="Good news"
          title="This week's wins"
          lead="Open the meeting on what went right: one personal and one work win each."
        >
          <div className="eos-stats">
            <Stat
              value={String(weeklyWins.completedEvents)}
              label="Events completed"
            />
            <Stat
              value={formatMoney(weeklyWins.revenue)}
              label="Completed revenue"
            />
            <Stat value={String(weeklyWins.newLeads)} label="New leads" />
            <Stat
              value={String(weeklyWins.convertedLeads)}
              label="Leads converted"
            />
          </div>
        </EosPanel>
      </div>

      <div id="l10-scorecard" className="mt-5 scroll-mt-48">
        <EosPanel
          tone="data"
          eyebrow="Data"
          title="Scorecard"
          lead="Only talk about the numbers off track; move anything that needs work to Issues."
          actions={
            <Link to={FINANCE_ROUTES.scorecard} className="btn btn-ghost">
              Set targets and owners
            </Link>
          }
        >
          <div className="eos-stats mb-4">
            <Stat
              value={formatMoney(scorecardMetrics.monthlyRevenue)}
              label="Revenue booked this month"
            />
            <Stat
              value={String(scorecardMetrics.eventsBooked)}
              label="Events booked this month"
            />
            <Stat
              value={percentText(scorecardMetrics.foodCostPct)}
              label="Food cost this month"
            />
            <Stat
              value={String(scorecardMetrics.newLeads)}
              label="New leads this month"
            />
          </div>
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="l10-scorecard">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Target</th>
                  <th>Now</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.map((row) => (
                  <tr key={row.measure.key}>
                    <td>
                      {row.measure.name}
                      <span className="ml-1 text-2xs text-ink-3">
                        (
                        {PERIOD_NAME[row.measure.period] === "today"
                          ? "today"
                          : `this ${PERIOD_NAME[row.measure.period]}`}
                        )
                      </span>
                    </td>
                    <td>
                      {row.target
                        ? formatScorecardValue(
                            row.target.target,
                            row.measure.unit,
                          )
                        : "Not set"}
                    </td>
                    <td className="font-mono">
                      {row.actual == null
                        ? NOT_KNOWN
                        : formatScorecardValue(row.actual, row.measure.unit)}
                    </td>
                    <td>{personName(row.target?.ownerPersonId)}</td>
                    <td>
                      <StatusChip
                        status={row.status}
                        color={STATUS_TONE[row.status] ?? "chip-tone-mute"}
                        label={SCORECARD_STATUS_LABEL[row.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EosPanel>
      </div>

      <LeadershipItemsPanel
        items={(items ?? []) as LeadershipItemRow[]}
        people={activePeople}
        now={now}
      />

      <div id="rating" className="scroll-mt-48">
        <L10MeetingRating
          meetings={(meetings ?? []) as LeadershipMeetingRow[]}
          people={activePeople}
          now={now}
        />
      </div>

      <div className="mt-5">
        <EosPanel
          tone="traction"
          eyebrow="Traction"
          title="The last eight weeks"
          lead="What was added and closed each week, next to the business it ran."
        >
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
                  <th>Meeting rating</th>
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
                    <td>
                      {week.meetingRating == null
                        ? "—"
                        : `${week.meetingRating} / 10`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EosPanel>
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
      <MergedSection
        id="scorecard"
        title="Company scorecard and targets"
        summary="Each company number against its target, with owner and trend."
      >
        <CompanyScorecardDashboardPage />
      </MergedSection>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="eos-stat">
      <span className="eos-stat-value font-mono">{value}</span>
      <h3>{label}</h3>
    </div>
  );
}
