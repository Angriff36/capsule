import { useMemo, useState } from "react";
import {
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
  SCORECARD_AREAS,
  SCORECARD_MEASURES,
  SCORECARD_NOT_COUNTED,
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
import { useScorecardSources } from "./useScorecardSources";
import { PERIOD_NAME } from "./scorecardPeriods";

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
  caution: CHIP_TONE_CLASS.warn,
  off_track: CHIP_TONE_CLASS.danger,
  no_target: CHIP_TONE_CLASS.mute,
  not_known: CHIP_TONE_CLASS.mute,
};

export function CompanyScorecardDashboardPage() {
  const refNow = useMemo(() => new Date(), []);
  const currentMonth = refNow.getMonth();
  const currentYear = refNow.getFullYear();
  const { sources, loading } = useScorecardSources(refNow);
  const events = sources.events;
  const targets = useListScorecardTarget();
  const people = useListPerson();
  const [editing, setEditing] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      scorecardRows(sources, (targets ?? []) as ScorecardTargetRow[], refNow),
    [sources, targets, refNow],
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

  const card = (row: ScorecardRow) => ({
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
  });

  const dashboardItems: Array<{
    id: string;
    size: DashboardGridSize;
    content: React.ReactNode;
    title?: string;
  }> = [
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
        lead="The weekly scorecard reviewed at the L10: each number against its target, with its owner, status and trend, live from Capsule."
      />

      {!loading && events.length === 0 ? (
        <div data-testid="dashboard-empty">
          <EmptyState
            title="No events yet"
            hint="The figures fill in as events are booked and completed."
          />
        </div>
      ) : null}

      {SCORECARD_AREAS.map((area) => {
        const notCounted = SCORECARD_NOT_COUNTED.filter(
          (item) => item.area === area,
        );
        return (
          <section
            key={area}
            className="mt-6 first:mt-0"
            data-testid={`scorecard-area-${area}`}
          >
            <h2 className="border-b border-line pb-1.5 text-base font-semibold text-ink">
              {area}
            </h2>
            <div className="mt-3">
              <DashboardGrid
                items={rows
                  .filter((row) => row.measure.area === area)
                  .map(card)}
              />
            </div>
            {notCounted.length > 0 ? (
              <ul
                className="mt-2 space-y-1 text-xs text-ink-2"
                data-testid="scorecard-not-counted"
              >
                {notCounted.map((item) => (
                  <li key={item.name}>
                    <span className="font-semibold text-ink">{item.name}</span>{" "}
                    is on the scorecard but not counted yet: {item.missing}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      <div className="mt-6">
        <DashboardGrid items={dashboardItems} />
      </div>

      <div className="mt-6 rounded-sm border border-line bg-inset p-4">
        <h4 className="text-xs font-semibold text-ink">
          Where these numbers come from
        </h4>
        <p className="mt-1 text-xs text-ink-2">
          The numbers and areas are the company&apos;s EOS scorecard. Weekly
          numbers run Monday to Sunday; the rest say their period on the card.
          Each card shows the target written on the scorecard until you set your
          own. A number is on track when it meets its target, caution when it
          misses by up to 10%, and off track beyond that; set a target and an
          owner on each card.
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
  const period = PERIOD_NAME[measure.period];
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
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs last{" "}
            {period}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-2xs text-ink-3">
        {measure.period === "now"
          ? "Counted from what is on file today."
          : row.actual == null
            ? `Nothing recorded yet this ${period}.`
            : row.previous != null
              ? `Last ${period}: ${formatValue(row.previous)}`
              : `No data for last ${period} yet.`}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-2 text-2xs text-ink-2">
        <dt>Target</dt>
        <dd data-testid="scorecard-target">
          {row.target
            ? `${row.target.direction === "lower_better" ? "At most" : "At least"} ${formatValue(row.target.target)}`
            : measure.scorecardTarget
              ? `Not set. Scorecard: ${measure.scorecardTarget}`
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
        aria-label={`${measure.name}, last ${row.trend.length} ${period}s`}
        data-testid="scorecard-trend"
      >
        {row.trend.map((point) => (
          <li key={point.label}>
            {point.label}:{" "}
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
