import { useMemo } from "react";
import type { SalesEvent } from "./mangia/salesFigures";
import {
  FigureRow,
  Note,
  ReportSection,
  change,
  dayText,
  money,
  percent,
  plural,
  type Figure,
} from "./mangia/SalesReportParts";
import {
  QUOTE_WEIGHT,
  TIMS_KPIS,
  TIMS_SCORECARD_SOURCE,
  WIN_RATE_ON_TRACK,
  timsScorecard,
  type TimsKpiId,
} from "./timsScorecard";

/** Tim's L10 scorecard figures, in the scorecard's order, on live events. */
export function TimsScorecardSection({
  events,
  now,
}: {
  events: readonly SalesEvent[];
  now: Date;
}) {
  const s = useMemo(() => timsScorecard(events, now), [events, now]);
  const year = now.getFullYear();
  const ytdText = `Jan 1 – ${dayText(now)}`;
  const vsLast = `vs ${year - 1} same dates`;
  const onFile = `On file ${dayText(now)}`;

  const figures: Record<TimsKpiId, Omit<Figure, "title">> = {
    ytd_revenue: {
      value: money(s.ytd.revenue),
      detail: `${year - 1}: ${money(s.lastYtd.revenue)} · ${change(s.revenueChange)}`,
      period: ytdText,
      tone: "brand",
    },
    ytd_events: {
      value: String(s.ytd.events),
      detail: `${year - 1}: ${s.lastYtd.events} · ${change(s.eventsChange)}`,
      period: ytdText,
    },
    ytd_aev: {
      value: money(s.ytd.aev),
      detail: `${year - 1}: ${money(s.lastYtd.aev)} · ${change(s.aevChange)}`,
      period: vsLast,
    },
    win_rate: {
      value: percent(s.winRate),
      detail: `${s.won} won of ${s.decided} decided${
        s.winRate == null
          ? ""
          : s.winRate >= WIN_RATE_ON_TRACK
            ? " · on track"
            : ` · below ${WIN_RATE_ON_TRACK}%`
      }`,
      period: ytdText,
      tone:
        s.winRate == null
          ? undefined
          : s.winRate >= WIN_RATE_ON_TRACK
            ? "ok"
            : "warn",
    },
    pipeline_value: {
      value: money(s.pipeline.revenue),
      detail: plural(s.pipeline.events, "open deal"),
      period: onFile,
      tone: "info",
    },
    weighted_forecast: {
      value: money(s.weightedForecast),
      detail: `Confirmed 100% + quotes ${QUOTE_WEIGHT * 100}%`,
      period: onFile,
    },
    confirmed_value: {
      value: money(s.confirmed.revenue),
      detail: plural(s.confirmed.events, "event"),
      period: onFile,
    },
    lost_ytd: {
      value: money(s.lost.revenue),
      detail: plural(s.lost.events, "deal"),
      period: ytdText,
      tone: s.lost.events > 0 ? "warn" : undefined,
    },
  };

  return (
    <div data-testid="tims-scorecard">
      <ReportSection title="L10 sales scorecard" period={ytdText}>
        <FigureRow
          figures={TIMS_KPIS.slice(0, 4).map((kpi) => ({
            title: kpi.title,
            ...figures[kpi.id],
          }))}
        />
        <FigureRow
          figures={TIMS_KPIS.slice(4).map((kpi) => ({
            title: kpi.title,
            ...figures[kpi.id],
          }))}
        />
        <Note>
          Counted the way Tim's {TIMS_SCORECARD_SOURCE} counts them. Confirmed
          events count in full and open quotes at half in the forecast.
        </Note>
      </ReportSection>
    </div>
  );
}
