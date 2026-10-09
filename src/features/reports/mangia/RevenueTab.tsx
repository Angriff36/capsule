import { useMemo } from "react";
import {
  WEEKS_PER_MONTH,
  changePercent,
  dayOfYear,
  isDelivered,
  lastFullQuarter,
  monthPeriod,
  monthRows,
  quarterPeriod,
  quarterRows,
  totals,
  within,
  yearRows,
  ytdPeriod,
  type SalesEvent,
  type Totals,
} from "./salesFigures";
import {
  FigureRow,
  FigureTable,
  MONTHS,
  Note,
  ReportSection,
  SubHeading,
  change,
  count,
  dayText,
  money,
} from "./SalesReportParts";

const weekly = (value: number, months = 1) => value / months / WEEKS_PER_MONTH;

function weeklyRows(
  events: readonly SalesEvent[],
  year: number,
  lastMonth: number,
  now: Date,
): string[][] {
  const rows: string[][] = [];
  let all = { events: 0, revenue: 0 };
  for (let month = 0; month <= lastMonth; month += 1) {
    const t = totals(within(events, monthPeriod(year, month), isDelivered));
    all = { events: all.events + t.events, revenue: all.revenue + t.revenue };
    const partial =
      year === now.getFullYear() && month === now.getMonth()
        ? ` (to ${MONTHS[month]} ${now.getDate()})`
        : "";
    rows.push([
      `${MONTHS[month]} ${year}${partial}`,
      count(t.events),
      money(t.revenue),
      `~${weekly(t.events).toFixed(1)}`,
      `~${money(weekly(t.revenue))}`,
    ]);
  }
  const months = lastMonth + 1;
  rows.push([
    "Average a week",
    `${count(all.events)} total`,
    `${money(all.revenue)} total`,
    `~${weekly(all.events, months).toFixed(1)}`,
    `~${money(weekly(all.revenue, months))}`,
  ]);
  return rows;
}

const cell = (t: Totals, field: "events" | "revenue" | "aev") =>
  t.events === 0 ? "—" : field === "events" ? count(t.events) : money(t[field]);

export function RevenueTab({
  events,
  now,
}: {
  events: readonly SalesEvent[];
  now: Date;
}) {
  const f = useMemo(() => {
    const year = now.getFullYear();
    const threeYears = [year - 2, year - 1, year];
    const [qYear, quarter] = lastFullQuarter(now);
    // Delivered history stops at today, as "so far" does everywhere else.
    const todayEnd = ytdPeriod(now, year).to;
    const history = events.filter(
      (e) => e.startsAt != null && e.startsAt < todayEnd,
    );
    const ytd = totals(within(events, ytdPeriod(now, year), isDelivered));
    const lastYtd = totals(
      within(events, ytdPeriod(now, year - 1), isDelivered),
    );
    const thisMonth = totals(
      within(history, monthPeriod(year, now.getMonth()), isDelivered),
    );
    const lastMonthDate = new Date(year, now.getMonth() - 1, 1);
    const lastMonth = totals(
      within(
        events,
        monthPeriod(lastMonthDate.getFullYear(), lastMonthDate.getMonth()),
        isDelivered,
      ),
    );
    const q = totals(
      within(events, quarterPeriod(qYear, quarter), isDelivered),
    );
    const qBefore = totals(
      within(events, quarterPeriod(qYear - 1, quarter), isDelivered),
    );
    return {
      year,
      threeYears,
      thisWeekly: weeklyRows(history, year, now.getMonth(), now),
      lastWeekly: weeklyRows(history, year - 1, 11, now),
      months: monthRows(history, threeYears),
      quarters: quarterRows(history, threeYears, now),
      years: yearRows(events),
      ytd,
      lastYtd,
      weeksSoFar: dayOfYear(now) / 7,
      thisMonth,
      lastMonth,
      lastMonthName: MONTHS[lastMonthDate.getMonth()]!,
      qYear,
      quarter,
      q,
      qBefore,
    };
  }, [events, now]);
  const last = f.year - 1;
  const asOf = `as of ${dayText(now)}`;

  return (
    <>
      <ReportSection
        title="Weekly Snapshot"
        period={`weekly averages worked out from each month, ${f.year} so far ${asOf}`}
      >
        <Note>
          <strong>How this is counted:</strong> each month's delivered events
          and revenue divided by {WEEKS_PER_MONTH} weeks. A guide to the weekly
          rhythm, not exact weeks.
        </Note>
        <SubHeading
          title={`${f.year} weekly averages (delivered revenue only)`}
          period={`Jan 1 – ${dayText(now)}`}
        />
        <FigureTable
          headers={[
            "Month",
            "Events (month)",
            "Revenue (month)",
            "Events a week",
            "Revenue a week",
          ]}
          rows={f.thisWeekly}
        />
        <SubHeading
          title={`${last} weekly averages (delivered revenue)`}
          period={`Jan 1 – Dec 31, ${last}`}
        />
        <FigureTable
          headers={[
            "Month",
            "Events (month)",
            "Revenue (month)",
            "Events a week",
            "Revenue a week",
          ]}
          rows={f.lastWeekly}
        />
      </ReportSection>

      <ReportSection
        title="Monthly Revenue Trend"
        period={`${f.threeYears[0]}–${f.year}, ${asOf}`}
      >
        <SubHeading title="Three-year month by month (delivered revenue)" />
        <FigureTable
          headers={[
            "Month",
            ...f.threeYears.flatMap((y) => [
              `${y} Events`,
              `${y} Revenue`,
              `${y} Avg`,
            ]),
          ]}
          rows={f.months.map((row) => [
            MONTHS[row.month]!,
            ...row.byYear.flatMap((t) => [
              cell(t, "events"),
              cell(t, "revenue"),
              cell(t, "aev"),
            ]),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Quarterly Revenue"
        period={`${f.threeYears[0]}–${f.year}, ${asOf}`}
      >
        <FigureTable
          headers={[
            "Quarter",
            "Events",
            "Revenue",
            "Avg/Event",
            "Guests",
            "Change on last quarter",
          ]}
          rows={f.quarters.map((row) => [
            `Q${row.quarter} ${row.year}`,
            count(row.events),
            money(row.revenue),
            cell(row, "aev"),
            count(row.guests),
            change(row.change),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Year by Year"
        period={`${f.years[0]?.year ?? f.year}–${f.year}, ${asOf}`}
      >
        <FigureTable
          headers={[
            "Year",
            "All events",
            "All revenue",
            "Delivered events",
            "Delivered revenue",
            "Delivered avg",
            "Delivered guests",
            "Revenue change",
          ]}
          rows={f.years.map((row) => [
            String(row.year),
            count(row.all.events),
            money(row.all.revenue),
            count(row.delivered.events),
            money(row.delivered.revenue),
            cell(row.delivered, "aev"),
            count(row.delivered.guests),
            change(row.deliveredChange),
          ])}
        />
        <SubHeading title="Events by stage, each year" period="Every stage" />
        <FigureTable
          headers={[
            "Year",
            "Delivered",
            "Booked",
            "Quote",
            "Waiting for approval",
            "Cancelled or lost",
          ]}
          rows={f.years.map((row) => [
            String(row.year),
            count(row.statusCounts.delivered),
            count(row.statusCounts.booked),
            count(row.statusCounts.quote),
            count(row.statusCounts.waiting),
            count(row.statusCounts.lost),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Week → Month → Year"
        period={`${f.year} so far, ${asOf}`}
      >
        <FigureRow
          figures={[
            {
              title: "Weekly pace",
              value: money(
                f.weeksSoFar > 0 ? f.ytd.revenue / f.weeksSoFar : null,
              ),
              detail: `${f.year} average a week (delivered)`,
              period: `Jan 1 – ${dayText(now)}`,
            },
            {
              title: "Month on month",
              value: change(
                changePercent(f.thisMonth.revenue, f.lastMonth.revenue),
              ),
              detail: `${f.lastMonthName} ${money(f.lastMonth.revenue)} → ${MONTHS[now.getMonth()]} ${money(f.thisMonth.revenue)} (so far)`,
              period: `${f.lastMonthName} vs ${MONTHS[now.getMonth()]} (part month)`,
            },
            {
              title: `Q${f.quarter} ${f.qYear} vs Q${f.quarter} ${f.qYear - 1}`,
              value: change(changePercent(f.q.revenue, f.qBefore.revenue)),
              detail: `${money(f.q.revenue)} vs ${money(f.qBefore.revenue)}`,
              period: "Last full quarter, each year",
            },
            {
              title: "This year vs last (same dates)",
              value: change(changePercent(f.ytd.revenue, f.lastYtd.revenue)),
              detail: `${money(f.ytd.revenue)} vs ${money(f.lastYtd.revenue)} (${last})`,
              period: "Jan 1 to today, each year",
            },
          ]}
        />
      </ReportSection>
    </>
  );
}
