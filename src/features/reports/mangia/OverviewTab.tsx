import { useMemo } from "react";
import {
  GROWTH_GOAL,
  changePercent,
  dayOfYear,
  daysInYear,
  isBookedAhead,
  isDelivered,
  isOpen,
  isWon,
  runRate,
  totals,
  winLoss,
  within,
  yearPeriod,
  ytdPeriod,
  type SalesEvent,
} from "./salesFigures";
import {
  FigureRow,
  Note,
  PaceBox,
  ReportSection,
  SignalStrip,
  change,
  count,
  dayText,
  money,
  percent,
} from "./SalesReportParts";

export function OverviewTab({
  events,
  now,
}: {
  events: readonly SalesEvent[];
  now: Date;
}) {
  const f = useMemo(() => {
    const year = now.getFullYear();
    const ytd = ytdPeriod(now, year);
    const lastYtd = ytdPeriod(now, year - 1);
    const thisYtd = within(events, ytd);
    const won = totals(thisYtd.filter(isWon));
    const delivered = totals(thisYtd.filter(isDelivered));
    const lastDelivered = totals(within(events, lastYtd, isDelivered));
    const lastYear = within(events, yearPeriod(year - 1));
    const lastYearDelivered = totals(lastYear.filter(isDelivered));
    const lastYearAll = totals(lastYear.filter(isWon));
    const goal =
      lastYearDelivered.aev == null
        ? null
        : lastYearDelivered.aev * (1 + GROWTH_GOAL);
    const pipeline = totals(events.filter(isOpen));
    const bookedAhead = totals(events.filter(isBookedAhead));
    const decisions = winLoss(thisYtd);
    const days = dayOfYear(now);
    const yearDays = daysInYear(year);
    return {
      year,
      ytdText: `Jan 1 – ${dayText(now)}`,
      won,
      delivered,
      lastDelivered,
      lastYearDelivered,
      lastYearAll,
      goal,
      pipeline,
      bookedAhead,
      decisions,
      days,
      yearDays,
      deliveredPace: changePercent(delivered.revenue, lastDelivered.revenue),
      aevGrowth:
        won.aev == null || lastYearDelivered.aev == null
          ? null
          : changePercent(won.aev, lastYearDelivered.aev),
      deliveredRate: runRate(delivered.revenue, days, yearDays),
      wonRate: runRate(won.revenue, days, yearDays),
      bookedRate: runRate(won.revenue + pipeline.revenue, days, yearDays),
    };
  }, [events, now]);

  const behind = f.deliveredPace != null && f.deliveredPace < 0;
  const asOf = `As of ${dayText(now)}`;
  const last = f.year - 1;

  return (
    <>
      <ReportSection
        title="Executive Health Check"
        period={`${f.year} so far: ${f.ytdText}`}
      >
        <FigureRow
          figures={[
            {
              title: "Revenue won this year",
              value: money(f.won.revenue),
              detail: `Delivered + booked · ${count(f.won.events)} events`,
              period: f.ytdText,
              tone: "ok",
            },
            {
              title: "Revenue delivered this year",
              value: money(f.delivered.revenue),
              detail: `Delivered only · ${count(f.delivered.events)} events`,
              period: f.ytdText,
              tone: "info",
            },
            {
              title: "Avg event value (won)",
              value: money(f.won.aev),
              detail: `vs ${money(f.lastYearDelivered.aev)} (${last} delivered)`,
              period: `${f.year} so far vs ${last} full year`,
            },
            {
              title: "Pipeline value",
              value: money(f.pipeline.revenue),
              detail: `Quotes + waiting for approval · ${count(f.pipeline.events)} events`,
              period: asOf,
              tone: "info",
            },
          ]}
        />
        <FigureRow
          figures={[
            {
              title: "Win rate",
              value: percent(f.decisions.winRate),
              detail: `${count(f.decisions.won.events)} won / ${count(f.decisions.decided)} decided`,
              period: f.ytdText,
              tone: "ok",
            },
            {
              title: "Revenue lost this year",
              value: money(f.decisions.lost.revenue),
              detail: `${count(f.decisions.lost.events)} events · avg ${money(f.decisions.lost.aev)}`,
              period: f.ytdText,
              tone: "warn",
            },
            {
              title: `${f.year} growth goal progress`,
              value: change(f.aevGrowth),
              detail: `Avg ${money(f.won.aev)} vs ${money(f.goal)} goal`,
              period: `Goal: 10% above ${last} average (${money(f.lastYearDelivered.aev)})`,
              tone: "ok",
            },
            {
              title: "Monthly pace",
              value:
                f.deliveredPace == null ? "—" : behind ? "Behind" : "Ahead",
              detail: `${money(f.delivered.revenue)} delivered vs ${money(f.lastDelivered.revenue)} same dates ${last}`,
              period: "Delivered revenue only",
              tone: behind ? "warn" : "ok",
            },
          ]}
        />
        <SignalStrip
          signals={[
            {
              title: "Revenue delivered",
              value: change(f.deliveredPace),
              detail: `${money(f.delivered.revenue)} vs ${money(f.lastDelivered.revenue)} same dates ${last}`,
              good: f.deliveredPace == null ? null : !behind,
            },
            {
              title: "Avg event value growth",
              value: change(f.aevGrowth),
              detail: `Won average ${money(f.won.aev)} vs ${last}'s ${money(f.lastYearDelivered.aev)}`,
              good:
                f.aevGrowth == null ? null : f.aevGrowth >= GROWTH_GOAL * 100,
            },
            {
              title: "Pipeline",
              value: money(f.pipeline.revenue),
              detail: `${count(f.pipeline.events)} open deals · ${money(f.bookedAhead.revenue)} booked ahead`,
              good: f.pipeline.events > 0 ? true : null,
            },
            {
              title: "Loss rate",
              value: percent(f.decisions.lossRatio),
              detail: `${money(f.decisions.lost.revenue)} lost · avg lost deal ${money(f.decisions.lost.aev)}`,
              good:
                f.decisions.lossRatio == null
                  ? null
                  : f.decisions.lossRatio < 20,
            },
          ]}
        />
        <Note>
          <strong>Bottom line:</strong>{" "}
          {f.deliveredPace == null
            ? `No delivered revenue on the same dates in ${last} to compare with.`
            : `${f.year} is ${behind ? "behind" : "ahead of"} ${last}'s delivered revenue for the same dates (${change(f.deliveredPace)}).`}{" "}
          {money(f.bookedAhead.revenue)} is booked but not yet delivered, and{" "}
          {money(f.pipeline.revenue)} is in open quotes.{" "}
          {f.aevGrowth == null
            ? ""
            : `Average event value is ${change(f.aevGrowth)} against ${last} (goal +10%).`}
        </Note>
      </ReportSection>

      <ReportSection
        title="Year-to-Date Pace"
        period={`${f.year} vs ${last}, as of ${dayText(now)}`}
      >
        <FigureRow
          figures={[
            {
              title: `Days into ${f.year}`,
              value: `${f.days} / ${f.yearDays}`,
              detail: `${((f.days / f.yearDays) * 100).toFixed(1)}% of the year gone`,
              period: f.ytdText,
            },
            {
              title: `${f.year} delivered so far`,
              value: money(f.delivered.revenue),
              detail: `vs ${money(f.lastDelivered.revenue)} same dates ${last}`,
              period: "Jan 1 to today, each year",
              tone: "info",
            },
            {
              title: `${f.year} won (delivered + booked)`,
              value: money(f.won.revenue),
              detail: `${count(f.won.events)} events booked and delivered`,
              period: f.ytdText,
              tone: "ok",
            },
          ]}
        />
        <PaceBox
          title="Yearly pace (delivered revenue only)"
          value={money(f.deliveredRate)}
          detail={`${money(f.delivered.revenue)} delivered in ${f.days} days, spread over ${f.yearDays} days`}
        />
        <PaceBox
          title="Yearly pace (won: delivered + booked)"
          value={money(f.wonRate)}
          detail={`${money(f.won.revenue)} won in ${f.days} days, spread over ${f.yearDays} days`}
        />
        <PaceBox
          title="Yearly pace (all booked: won + pipeline)"
          value={money(f.bookedRate)}
          detail={`${money(f.won.revenue + f.pipeline.revenue)} won and quoted in ${f.days} days, spread over ${f.yearDays} days`}
        />
        <FigureRow
          figures={[
            {
              title: `Pace vs ${last} delivered (${money(f.lastYearDelivered.revenue)})`,
              value: change(
                changePercent(f.deliveredRate, f.lastYearDelivered.revenue),
              ),
              detail: "Delivered revenue only",
              period: `${f.year} yearly pace vs ${last} full year`,
            },
            {
              title: `Pace vs ${last} won (${money(f.lastYearAll.revenue)})`,
              value: change(changePercent(f.wonRate, f.lastYearAll.revenue)),
              detail: "Delivered + booked",
              period: `${f.year} yearly pace vs ${last} full year`,
            },
            {
              title: "Where we stand",
              value:
                f.deliveredPace == null
                  ? "—"
                  : behind
                    ? "Behind on delivered"
                    : "On pace",
              detail: `${money(f.bookedAhead.revenue)} booked ahead`,
              period: asOf,
              tone: behind ? "warn" : "ok",
            },
          ]}
        />
      </ReportSection>
    </>
  );
}
