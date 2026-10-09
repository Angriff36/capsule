import { useMemo } from "react";
import {
  groupWinLoss,
  isOpen,
  isOpenQuote,
  isWaiting,
  totals,
  winLoss,
  within,
  yearPeriod,
  yearsWithEvents,
  ytdPeriod,
  type SalesEvent,
  type SalesLabels,
} from "./salesFigures";
import {
  FigureRow,
  FigureTable,
  ReportSection,
  SubHeading,
  count,
  dayText,
  money,
  percent,
} from "./SalesReportParts";

export function PipelineTab<E extends SalesEvent>({
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
    const thisYtd = within(events, ytdPeriod(now, year));
    return {
      year,
      quotes: totals(events.filter(isOpenQuote)),
      waiting: totals(events.filter(isWaiting)),
      pipeline: totals(events.filter(isOpen)),
      thisYear: winLoss(thisYtd),
      lastYear: winLoss(within(events, yearPeriod(year - 1))),
      byYear: yearsWithEvents(events).map((y) => ({
        year: y,
        ...winLoss(within(events, yearPeriod(y))),
      })),
      people: groupWinLoss(thisYtd, labels.salesperson),
      sources: groupWinLoss(events, labels.leadSource),
    };
  }, [events, now, labels]);
  const asOf = `As of ${dayText(now)}`;
  const ytdText = `Jan 1 – ${dayText(now)}`;
  const last = f.year - 1;

  return (
    <>
      <ReportSection title="Open Pipeline" period={`${f.year}, ${asOf}`}>
        <FigureRow
          figures={[
            {
              title: "Open quotes",
              value: money(f.quotes.revenue),
              detail: `${count(f.quotes.events)} events · ${count(f.quotes.guests)} guests`,
              period: asOf,
              tone: "info",
            },
            {
              title: "Waiting for approval",
              value: money(f.waiting.revenue),
              detail: `${count(f.waiting.events)} events · ${count(f.waiting.guests)} guests`,
              period: asOf,
              tone: "info",
            },
            {
              title: "Total pipeline",
              value: money(f.pipeline.revenue),
              detail: `${count(f.pipeline.events)} events · ${count(f.pipeline.guests)} guests`,
              period: asOf,
              tone: "info",
            },
            {
              title: "Revenue at risk",
              value: money(f.pipeline.revenue),
              detail: "Not won until the client says yes",
              period: asOf,
              tone: "warn",
            },
          ]}
        />
        <FigureRow
          figures={[
            {
              title: `${f.year} win rate (won / decided)`,
              value: percent(f.thisYear.winRate),
              detail: `${count(f.thisYear.won.events)} won + ${count(f.thisYear.lost.events)} lost = ${count(f.thisYear.decided)} decided`,
              period: ytdText,
              tone: "ok",
            },
            {
              title: `Revenue lost in ${f.year}`,
              value: money(f.thisYear.lost.revenue),
              detail: `${count(f.thisYear.lost.events)} deals, avg ${money(f.thisYear.lost.aev)}`,
              period: ytdText,
              tone: "warn",
            },
            {
              title: "Lost for every $1 won",
              value:
                f.thisYear.lossRatio == null
                  ? "—"
                  : money(f.thisYear.lossRatio / 100),
              detail: `${money(f.thisYear.lost.revenue)} lost vs ${money(f.thisYear.won.revenue)} won`,
              period: ytdText,
            },
            {
              title: `${last} win rate (to compare)`,
              value: percent(f.lastYear.winRate),
              detail: `${count(f.lastYear.won.events)} won + ${count(f.lastYear.lost.events)} lost = ${count(f.lastYear.decided)} decided`,
              period: `Jan 1 – Dec 31, ${last}`,
            },
          ]}
        />
      </ReportSection>

      <ReportSection title="Losses" period={asOf}>
        <SubHeading title="Losses by year" />
        <FigureTable
          headers={[
            "Year",
            "Lost events",
            "Lost revenue",
            "Avg lost deal",
            "Won revenue",
            "Lost / won",
          ]}
          rows={f.byYear.map((row) => [
            String(row.year),
            count(row.lost.events),
            money(row.lost.revenue),
            row.lost.events ? money(row.lost.aev) : "—",
            money(row.won.revenue),
            percent(row.lossRatio),
          ])}
        />
      </ReportSection>

      <ReportSection title="Win Rates" period={asOf}>
        <FigureRow
          figures={[
            {
              title: `${last} win rate`,
              value: percent(f.lastYear.winRate),
              detail: `${count(f.lastYear.won.events)} won / ${count(f.lastYear.decided)} decided`,
              period: `Jan 1 – Dec 31, ${last}`,
            },
            {
              title: `${f.year} win rate so far`,
              value: percent(f.thisYear.winRate),
              detail: `${count(f.thisYear.won.events)} won / ${count(f.thisYear.decided)} decided`,
              period: ytdText,
              tone: "ok",
            },
            ...f.people.map((row) => ({
              title: `${row.label} ${f.year}`,
              value: percent(row.winRate),
              detail: `${count(row.won.events)} won / ${count(row.decided)} decided`,
              period: ytdText,
            })),
          ]}
        />
      </ReportSection>

      <ReportSection
        title="Where Leads Come From"
        period={`every year, ${asOf}`}
      >
        <FigureTable
          headers={[
            "Lead source",
            "All events",
            "Won",
            "Lost",
            "Win rate",
            "Won revenue",
            "Lost revenue",
            "Avg won deal",
          ]}
          rows={f.sources.map((row) => [
            row.label,
            count(row.all),
            count(row.won.events),
            count(row.lost.events),
            percent(row.winRate),
            money(row.won.revenue),
            money(row.lost.revenue),
            row.won.events ? money(row.won.aev) : "—",
          ])}
        />
      </ReportSection>
    </>
  );
}
