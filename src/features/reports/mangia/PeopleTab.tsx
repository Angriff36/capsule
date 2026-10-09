import { useMemo } from "react";
import {
  groupWinLoss,
  isWon,
  totals,
  within,
  yearPeriod,
  ytdPeriod,
  type GroupRow,
  type SalesEvent,
  type SalesLabels,
} from "./salesFigures";
import {
  FigureRow,
  FigureTable,
  ReportSection,
  SubHeading,
  count,
  plural,
  dayText,
  money,
  percent,
} from "./SalesReportParts";

interface PersonRow extends GroupRow {
  readonly guests: number;
}

function people<E extends SalesEvent>(
  events: readonly E[],
  labels: SalesLabels<E>,
): PersonRow[] {
  return groupWinLoss(events, labels.salesperson).map((row) => ({
    ...row,
    guests: totals(
      events.filter((e) => isWon(e) && labels.salesperson(e) === row.label),
    ).guests,
  }));
}

const HEADERS = [
  "Salesperson",
  "Won",
  "Lost",
  "Win rate",
  "Won revenue",
  "Lost revenue",
  "Avg won",
  "Guests",
];

const tableRows = (rows: readonly PersonRow[]) =>
  rows.map((row) => [
    row.label,
    count(row.won.events),
    count(row.lost.events),
    percent(row.winRate),
    money(row.won.revenue),
    money(row.lost.revenue),
    row.won.events ? money(row.won.aev) : "—",
    count(row.guests),
  ]);

export function PeopleTab<E extends SalesEvent>({
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
    return {
      year,
      lastYear: people(within(events, yearPeriod(year - 1)), labels),
      thisYear: people(within(events, ytdPeriod(now, year)), labels),
    };
  }, [events, now, labels]);
  const last = f.year - 1;
  const lastText = `Jan 1 – Dec 31, ${last}`;
  const ytdText = `Jan 1 – ${dayText(now)}`;

  const card = (row: PersonRow, year: number, period: string) => ({
    title: `${row.label} — ${year} avg event value`,
    value: row.won.events ? money(row.won.aev) : "—",
    detail: `${plural(row.won.events, "event")} · ${percent(row.winRate)} close rate`,
    period,
  });

  return (
    <>
      <ReportSection
        title="Salesperson Performance"
        period={`${last} full year + ${f.year} so far`}
      >
        <SubHeading title={`${last}`} period={lastText} />
        <FigureTable headers={HEADERS} rows={tableRows(f.lastYear)} />
        <SubHeading title={`${f.year} so far`} period={ytdText} />
        <FigureTable headers={HEADERS} rows={tableRows(f.thisYear)} />
      </ReportSection>

      <ReportSection
        title="Close Rates and Avg Event Value by Person"
        period={`${last}–${f.year}, as of ${dayText(now)}`}
      >
        <FigureRow
          figures={[
            ...f.lastYear.map((row) => card(row, last, lastText)),
            ...f.thisYear.map((row) => card(row, f.year, ytdText)),
          ]}
        />
      </ReportSection>
    </>
  );
}
