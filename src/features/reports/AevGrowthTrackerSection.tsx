import { useMemo } from "react";
import type { SalesEvent } from "./mangia/salesFigures";
import {
  FigureRow,
  FigureTable,
  MONTHS,
  PaceBox,
  ReportSection,
  change,
  count,
  money,
  percent,
} from "./mangia/SalesReportParts";
import { aevGrowthTracker, pipelineByUpsell } from "./aevGrowthTracker";
import { UPSELL_POTENTIAL } from "../events/EventUpsellPotentialCard";

/**
 * The growth strategy's monthly tracker and close-rate watch
 * (aevGrowthTracker.ts) at the top of the Average Event Value page.
 */
export function AevGrowthTrackerSection({
  events,
  now,
}: {
  events: readonly (SalesEvent & {
    readonly upsellPotential?: string | null;
  })[];
  now: Date;
}) {
  const t = useMemo(() => aevGrowthTracker(events, now), [events, now]);
  const pipeline = useMemo(() => pipelineByUpsell(events), [events]);
  const last = t.year - 1;
  const lastMonth = t.months.at(-2);
  return (
    <div className="mt-6" data-testid="aev-growth-tracker">
      <ReportSection
        title="10% growth goal tracker"
        period={`${t.year}, won events (delivered + booked) by event date`}
      >
        <FigureRow
          figures={[
            {
              title: `${last} average (starting point)`,
              value: money(t.baselineAev),
              detail: "Delivered events",
              period: `Jan 1 – Dec 31, ${last}`,
            },
            {
              title: `${t.year} goal (+10%)`,
              value: money(t.goal),
              detail: `${money(t.baselineAev)} × 1.10`,
              period: "Average event value to beat",
              tone: "brand",
            },
            {
              title: `${last} close rate (baseline)`,
              value: percent(t.baselineCloseRate),
              detail: "Won ÷ (won + lost)",
              period: "Must not drop while prices go up",
            },
          ]}
        />
        <FigureTable
          headers={[
            "Month",
            "Won events",
            "Revenue",
            "Avg event value",
            "vs goal",
            "vs last year",
          ]}
          rows={t.months.map((m) => [
            MONTHS[m.month]!,
            count(m.won.events),
            money(m.won.revenue),
            m.won.events ? money(m.won.aev) : "—",
            change(m.vsGoal),
            change(m.vsLastYear),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Close rate watch"
        period={`${t.year}, deals decided by event date`}
      >
        {t.closeRateWarning ? (
          <div
            className="rounded-sm border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-ink"
            role="status"
          >
            Close rate has been under {last}'s {percent(t.baselineCloseRate)}{" "}
            for the last two months. Look over recent proposals: add-ons may be
            pricing clients out.
          </div>
        ) : (
          <PaceBox
            title="Last full month"
            value={lastMonth ? percent(lastMonth.closeRate) : "—"}
            detail={
              lastMonth?.belowBaseline == null
                ? "Nothing to compare yet."
                : lastMonth.belowBaseline
                  ? `Under ${last}'s ${percent(t.baselineCloseRate)}.`
                  : `At or above ${last}'s ${percent(t.baselineCloseRate)}.`
            }
          />
        )}
        <FigureTable
          headers={["Month", "Won", "Lost", "Close rate", "Baseline", "Status"]}
          rows={t.months.map((m) => [
            MONTHS[m.month]!,
            count(m.wonDeals),
            count(m.lostDeals),
            m.closeRate == null ? "—" : percent(m.closeRate),
            percent(t.baselineCloseRate),
            m.belowBaseline == null
              ? "—"
              : m.belowBaseline
                ? "Below"
                : "On track",
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Deals not held yet, by add-on potential"
        period="quotes, deals waiting for approval and booked events still ahead; tag each on the event's Overview"
      >
        <FigureTable
          headers={[
            "Add-on potential",
            "Deals",
            "Value",
            "Usual add-ons",
            "What to do",
          ]}
          rows={pipeline.map((row) => {
            const tag = row.tag ? UPSELL_POTENTIAL[row.tag] : null;
            return [
              tag ? tag.label : "Not tagged yet",
              count(row.events),
              money(row.revenue),
              tag ? tag.range : "—",
              tag ? tag.action : "Tag it on the event's Overview",
            ];
          })}
        />
      </ReportSection>
    </div>
  );
}
