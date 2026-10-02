import { useMemo, useState } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListLead,
  useListPerson,
  useListScorecardTarget,
} from "@/lib/manifest-convex-react";
import {
  DashboardGrid,
  type DashboardGridSize,
} from "@/ui/charts/DashboardGrid";
import { BarChart } from "@/ui/charts/BarChart";
import { EmptyState, PageHeader, StatusChip } from "@/ui/primitives";
import { CHIP_TONE_CLASS } from "@/lib/statusLabels";
import { formatMoney } from "@/lib/format";
import { isBookedEvent } from "./dashboardRecordSets";
import { MetricDefinitionList } from "./MetricDefinitionList";
import {
  SCORECARD_MEASURES,
  SCORECARD_STATUS_LABEL,
  formatScorecardValue,
  scorecardRows,
  type ScorecardRow,
  type ScorecardStatus,
  type ScorecardTargetRow,
} from "./scorecardMeasures";
import {
  ScorecardTargetEditor,
  type ScorecardPerson,
} from "./ScorecardTargetEditor";

/**
 * Company Scorecard Dashboard (Priority 37)
 *
 * Executive scorecard of the core monthly numbers — revenue, food cost,
 * profit margin, lead conversion, completed events, and guests. Each number
 * shows its live actual, its target and owner (ScorecardTarget), whether it
 * is on track, and a six-month trend (scorecardMeasures.ts).
 */

const STATUS_TONE: Record<ScorecardStatus, string> = {
  on_track: CHIP_TONE_CLASS.ok,
  off_track: CHIP_TONE_CLASS.danger,
  no_target: CHIP_TONE_CLASS.mute,
  not_known: CHIP_TONE_CLASS.mute,
};

export function CompanyScorecardDashboardPage() {
  const events = useListEvent();
  const closeouts = useListEventCloseout();
  const leads = useListLead();
  const targets = useListScorecardTarget();
  const people = useListPerson();
  const [editing, setEditing] = useState<string | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const rows = useMemo(
    () =>
      scorecardRows(
        {
          events: events ?? [],
          closeouts: closeouts ?? [],
          leads: leads ?? [],
        },
        (targets ?? []) as ScorecardTargetRow[],
        new Date(currentYear, currentMonth, 15),
      ),
    [events, closeouts, leads, targets, currentYear, currentMonth],
  );

  const activePeople: ScorecardPerson[] = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const personName = (id: string | null | undefined) => {
    if (!id) return null;
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}`.trim() : null;
  };

  // Monthly trend data (last 6 months of revenue)
  const monthlyTrendData = useMemo(() => {
    if (!events) return [];

    const monthMap = new Map<string, { revenue: number; eventCount: number }>();

    // Populate with last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(monthKey, { revenue: 0, eventCount: 0 });
    }

    events.forEach((event) => {
      if (!event.startsAt || !isBookedEvent(event)) return;
      const date = new Date(event.startsAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthMap.has(monthKey)) return;

      const data = monthMap.get(monthKey)!;
      data.revenue += event.quotedPrice || 0;
      data.eventCount += 1;
    });

    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      revenue: data.revenue,
      eventCount: data.eventCount,
    }));
  }, [events, currentYear, currentMonth]);

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
    ...rows.map((row) => ({
      id: row.measure.key,
      size: "medium" as const,
      content: (
        <MetricCard
          row={row}
          ownerName={personName(row.target?.ownerPersonId)}
          editing={editing === row.measure.key}
          onEdit={() => setEditing(row.measure.key)}
          editor={
            <ScorecardTargetEditor
              measure={row.measure}
              target={row.target}
              people={activePeople}
              onDone={() => setEditing(null)}
            />
          }
        />
      ),
    })),
    {
      id: "monthly-trends",
      size: "full",
      content: (
        <BarChart
          data={monthlyTrendData}
          xAxisKey="month"
          series={[
            {
              dataKey: "revenue",
              name: "Revenue",
              color: "var(--color-brand)",
            },
          ]}
          height={300}
          formatYAxis={formatMoney}
        />
      ),
      title: "Monthly Revenue Trend (6 Months)",
    },
  ];

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Company Scorecard"
        lead="The core monthly numbers against their targets, with owners and a six-month trend, live from your events, closeouts, and leads."
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

      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-1 text-xs text-ink-2">
          Revenue and guest counts come from events scheduled this month. Food
          cost and profit margin come from finished event closeouts. Lead
          conversion counts leads created this month that converted. A number is
          on track when this month meets its target; set a target and an owner
          on each card.
        </p>
      </div>

      <MetricDefinitionList
        metricIds={SCORECARD_MEASURES.map((measure) => measure.metricId)}
      />
    </div>
  );
}

function MetricCard({
  row,
  ownerName,
  editing,
  onEdit,
  editor,
}: {
  row: ScorecardRow;
  ownerName: string | null;
  editing: boolean;
  onEdit: () => void;
  editor: React.ReactNode;
}) {
  const { measure } = row;
  const formatValue = (value: number) =>
    formatScorecardValue(value, measure.unit);

  const change =
    row.actual != null && row.previous != null && row.previous !== 0
      ? ((row.actual - row.previous) / Math.abs(row.previous)) * 100
      : null;
  const improving =
    change == null
      ? null
      : measure.direction === "higher_better"
        ? change >= 0
        : change <= 0;

  return (
    <div
      className="rounded-sm border border-line bg-panel p-4"
      data-testid={`scorecard-row-${measure.key}`}
    >
      <h3 className="font-semibold text-ink">{measure.name}</h3>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xl font-bold text-ink">
          {row.actual != null ? formatValue(row.actual) : "—"}
        </span>
        {change != null ? (
          <span
            className={`text-xs font-medium ${improving ? "text-ok" : "text-danger"}`}
          >
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs last
            month
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        {row.actual == null
          ? "Nothing recorded yet this month."
          : row.previous != null
            ? `Last month: ${formatValue(row.previous)}`
            : "No data for last month yet."}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-2 text-2xs text-ink-2">
        <dt>Target</dt>
        <dd data-testid="scorecard-target">
          {row.target
            ? `${row.target.direction === "lower_better" ? "At most" : "At least"} ${formatValue(row.target.target)}`
            : "Not set"}
        </dd>
        <dt>Owner</dt>
        <dd data-testid="scorecard-owner">{ownerName ?? "No owner"}</dd>
        <dt>Status</dt>
        <dd data-testid="scorecard-status">
          <StatusChip
            status={SCORECARD_STATUS_LABEL[row.status]}
            color={STATUS_TONE[row.status]}
          />
        </dd>
      </dl>

      <ol
        className="mt-2 flex flex-wrap gap-x-2 text-2xs text-ink-3"
        aria-label={`${measure.name}, last six months`}
        data-testid="scorecard-trend"
      >
        {row.trend.map((point) => (
          <li key={point.month}>
            {point.month.slice(5)}:{" "}
            {point.value == null ? "—" : formatValue(point.value)}
          </li>
        ))}
      </ol>

      {editing ? (
        editor
      ) : (
        <button type="button" className="btn-link mt-2" onClick={onEdit}>
          {row.target ? "Change target" : "Set target"}
        </button>
      )}
    </div>
  );
}
