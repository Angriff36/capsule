import { useMemo } from "react";
import {
  GROWTH_GOAL,
  changePercent,
  groupTotals,
  isDelivered,
  isWon,
  monthRows,
  totals,
  within,
  yearPeriod,
  yearRows,
  ytdPeriod,
  type SalesEvent,
  type SalesLabels,
  type Totals,
} from "./salesFigures";
import {
  FigureRow,
  FigureTable,
  MONTHS,
  PaceBox,
  ReportSection,
  change,
  count,
  dayText,
  money,
} from "./SalesReportParts";

interface BarRow extends Totals {
  readonly label: string;
}

/** Events, revenue and average per row, with a bar for the average. */
function AverageBars({ rows }: { rows: readonly BarRow[] }) {
  const top = Math.max(0, ...rows.map((row) => row.aev ?? 0));
  return (
    <div className="overflow-auto rounded-sm border border-line bg-panel">
      <table className="w-full text-xs">
        <thead className="bg-inset">
          <tr className="text-ink-2">
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="px-4 py-2 text-right font-medium">Events</th>
            <th className="px-4 py-2 text-right font-medium">Revenue</th>
            <th className="px-4 py-2 text-right font-medium">Avg</th>
            <th className="w-1/3 px-4 py-2 text-left font-medium">Bar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label} className="text-ink-2">
              <td className="px-4 py-2">{row.label}</td>
              <td className="px-4 py-2 text-right">{count(row.events)}</td>
              <td className="px-4 py-2 text-right">{money(row.revenue)}</td>
              <td className="px-4 py-2 text-right">
                {row.events ? money(row.aev) : "—"}
              </td>
              <td className="px-4 py-2">
                <div
                  className="h-2 rounded-xs bg-brand"
                  style={{
                    width: top > 0 ? `${((row.aev ?? 0) / top) * 100}%` : 0,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AevTab<E extends SalesEvent>({
  events,
  now,
  labels,
}: {
  events: readonly E[];
  now: Date;
  labels: SalesLabels<E>;
}) {
  const f = useMemo(() => {
    const year = now.getFullYear();
    const lastYear = within(events, yearPeriod(year - 1));
    const lastWon = lastYear.filter(isWon);
    const baseline = totals(lastYear.filter(isDelivered));
    const goal = baseline.aev == null ? null : baseline.aev * (1 + GROWTH_GOAL);
    const ytd = within(events, ytdPeriod(now, year));
    const years = yearRows(events);
    return {
      year,
      baseline,
      goal,
      delivered: totals(ytd.filter(isDelivered)),
      won: totals(ytd.filter(isWon)),
      years,
      met: years.filter((row) => row.goalMet === true).map((r) => r.year),
      missed: years.filter((row) => row.goalMet === false).map((r) => r.year),
      months: monthRows(events, [year - 1]).map((row) => ({
        label: MONTHS[row.month]!,
        ...row.byYear[0]!,
      })),
      types: groupTotals(lastWon, labels.eventType).sort(
        (a, b) => (b.aev ?? 0) - (a.aev ?? 0),
      ),
      styles: groupTotals(lastWon, labels.serviceStyle).sort(
        (a, b) => (b.aev ?? 0) - (a.aev ?? 0),
      ),
    };
  }, [events, now, labels]);
  const last = f.year - 1;
  const ytdText = `Jan 1 – ${dayText(now)}`;
  const vsGoal = (aev: number | null) =>
    aev == null || f.goal == null ? null : changePercent(aev, f.goal);
  const onTrack = f.won.aev != null && f.goal != null && f.won.aev >= f.goal;
  const yearsText = (years: number[]) =>
    years.length ? years.join(", ") : "None yet";

  return (
    <>
      <ReportSection
        title="Avg Event Value — Growth Goal"
        period={`${f.years[0]?.year ?? f.year}–${f.year}, as of ${dayText(now)}`}
      >
        <FigureRow
          figures={[
            {
              title: `${f.year} company growth goal`,
              value: money(f.goal),
              detail: `10% above ${last}'s ${money(f.baseline.aev)}`,
              period: `Set against ${last} full year average`,
              tone: "brand",
            },
            {
              title: `${f.year} average so far (delivered)`,
              value: money(f.delivered.aev),
              detail: `${count(f.delivered.events)} delivered events`,
              period: ytdText,
              tone: "info",
            },
            {
              title: `${f.year} average so far (won)`,
              value: money(f.won.aev),
              detail: `${count(f.won.events)} won events (delivered + booked)`,
              period: ytdText,
              tone: "ok",
            },
            {
              title: "Against the goal",
              value: change(vsGoal(f.won.aev)),
              detail: `Won average ${money(f.won.aev)} vs ${money(f.goal)} goal`,
              period: onTrack ? "Above the goal" : "Below the goal",
              tone: onTrack ? "ok" : "warn",
            },
          ]}
        />
      </ReportSection>

      <ReportSection
        title="Avg Event Value by Year"
        period="delivered events only"
      >
        <FigureTable
          headers={[
            "Year",
            "Delivered events",
            "Delivered revenue",
            "Avg",
            "Change",
            "vs 10% goal",
          ]}
          rows={f.years.map((row) => [
            String(row.year),
            count(row.delivered.events),
            money(row.delivered.revenue),
            row.delivered.events ? money(row.delivered.aev) : "—",
            change(
              row.goalMet == null
                ? null
                : changePercent(
                    row.delivered.aev ?? 0,
                    f.years.find((y) => y.year === row.year - 1)?.delivered
                      .aev ?? 0,
                  ),
            ),
            row.goalMet == null ? "—" : row.goalMet ? "Met" : "Missed",
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Avg Event Value by Month"
        period={`${last} full year, delivered events`}
      >
        <AverageBars rows={f.months} />
      </ReportSection>

      <ReportSection
        title="Avg Event Value by Event Type"
        period={`${last} full year, won events`}
      >
        <AverageBars rows={f.types} />
      </ReportSection>

      <ReportSection
        title="Avg Event Value by Service Style"
        period={`${last} full year, won events`}
      >
        <AverageBars rows={f.styles} />
      </ReportSection>

      <ReportSection
        title="10% Growth Goal — In Detail"
        period="delivered events, each year"
      >
        <FigureRow
          figures={[
            {
              title: `Starting point (${last} average)`,
              value: money(f.baseline.aev),
              detail: `${count(f.baseline.events)} delivered events`,
              period: `Jan 1 – Dec 31, ${last}`,
            },
            {
              title: "10% growth goal",
              value: money(f.goal),
              detail: `${money(f.baseline.aev)} × 1.10`,
              period: `Company growth goal for ${f.year}`,
              tone: "brand",
            },
            {
              title: `${f.year} average so far (delivered)`,
              value: money(f.delivered.aev),
              detail: `${count(f.delivered.events)} delivered events`,
              period: ytdText,
            },
            {
              title: `${f.year} average so far (won)`,
              value: money(f.won.aev),
              detail: `${count(f.won.events)} won events`,
              period: ytdText,
            },
          ]}
        />
        <PaceBox
          title="Growth goal check"
          value={onTrack ? "On track" : "Not on track yet"}
          detail={`Won average ${money(f.won.aev)} is ${change(vsGoal(f.won.aev))} against the ${money(f.goal)} goal; delivered average ${money(f.delivered.aev)} is ${change(vsGoal(f.delivered.aev))}.`}
        />
        <FigureRow
          figures={[
            {
              title: "Years the goal was met",
              value: count(f.met.length),
              detail: yearsText(f.met),
              period: "Each year vs the year before + 10%",
              tone: "ok",
            },
            {
              title: "Years below the goal",
              value: count(f.missed.length),
              detail: yearsText(f.missed),
              period: "Each year vs the year before + 10%",
              tone: "warn",
            },
            {
              title: "Where it is heading",
              value: onTrack ? "Growing" : "Below goal",
              detail: `${f.year} won average vs ${last} average: ${change(
                f.won.aev == null || f.baseline.aev == null
                  ? null
                  : changePercent(f.won.aev, f.baseline.aev),
              )}`,
              period: `As of ${dayText(now)}`,
            },
          ]}
        />
      </ReportSection>
    </>
  );
}
