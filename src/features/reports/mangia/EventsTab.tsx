import { useMemo } from "react";
import {
  changePercent,
  groupTotals,
  isWon,
  totals,
  within,
  yearPeriod,
  ytdPeriod,
  type SalesEvent,
  type SalesLabels,
} from "./salesFigures";
import {
  FigureTable,
  ReportSection,
  SubHeading,
  change,
  count,
  dayText,
  money,
  percent,
} from "./SalesReportParts";

export function EventsTab<E extends SalesEvent>({
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
    const lastWon = within(events, yearPeriod(year - 1), isWon);
    const thisWon = within(events, ytdPeriod(now, year), isWon);
    const types = new Set([
      ...lastWon.map(labels.eventType),
      ...thisWon.map(labels.eventType),
    ]);
    return {
      year,
      byType: groupTotals([...lastWon, ...thisWon], labels.eventType),
      typeYears: [...types]
        .map((type) => {
          const before = totals(
            lastWon.filter((e) => labels.eventType(e) === type),
          );
          const after = totals(
            thisWon.filter((e) => labels.eventType(e) === type),
          );
          return { type, before, after };
        })
        .sort((a, b) => b.after.revenue - a.after.revenue),
      byStyle: groupTotals(lastWon, labels.serviceStyle),
      venues: groupTotals(events.filter(isWon), labels.venue).slice(0, 15),
    };
  }, [events, now, labels]);
  const last = f.year - 1;
  const asOf = `as of ${dayText(now)}`;

  return (
    <>
      <ReportSection title="Event Types" period={`${last}–${f.year}, ${asOf}`}>
        <SubHeading
          title="Every won event by type"
          period={`${last}: full year · ${f.year}: Jan 1 – ${dayText(now)}`}
        />
        <FigureTable
          headers={[
            "Event type",
            "Events",
            "Revenue",
            "Avg/Event",
            "Share of revenue",
            "Guests",
          ]}
          rows={f.byType.map((row) => [
            row.label,
            count(row.events),
            money(row.revenue),
            money(row.aev),
            percent(row.share),
            count(row.guests),
          ])}
        />
        <SubHeading
          title="Year on year by event type"
          period={`${last}: full year · ${f.year}: so far`}
        />
        <FigureTable
          headers={[
            "Type",
            `${last} revenue`,
            `${last} events`,
            `${last} avg`,
            `${f.year} revenue`,
            `${f.year} events`,
            `${f.year} avg`,
            "Avg change",
          ]}
          rows={f.typeYears.map((row) => [
            row.type,
            money(row.before.revenue),
            count(row.before.events),
            row.before.events ? money(row.before.aev) : "—",
            money(row.after.revenue),
            count(row.after.events),
            row.after.events ? money(row.after.aev) : "—",
            change(
              row.before.aev == null || row.after.aev == null
                ? null
                : changePercent(row.after.aev, row.before.aev),
            ),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Service Styles"
        period={`${last} full year, won events`}
      >
        <FigureTable
          headers={[
            "Service style",
            "Events",
            "Revenue",
            "Avg/Event",
            "Share of revenue",
          ]}
          rows={f.byStyle.map((row) => [
            row.label,
            count(row.events),
            money(row.revenue),
            money(row.aev),
            percent(row.share),
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Top 15 Venues"
        period={`every year, won events, ${asOf}`}
      >
        <FigureTable
          headers={["Venue", "Events", "Revenue", "Avg/Event", "Guests"]}
          rows={f.venues.map((row) => [
            row.label,
            count(row.events),
            money(row.revenue),
            money(row.aev),
            count(row.guests),
          ])}
        />
      </ReportSection>
    </>
  );
}
