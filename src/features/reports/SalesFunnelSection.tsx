import { useMemo, useState } from "react";
import {
  useListPerson,
  useListReferralSource,
} from "../../lib/manifest-convex-react";
import { formatCount, formatMoney } from "../../lib/format";
import {
  useEventRecordsInRange,
  useEventsInRange,
} from "../facilities/useEventsById";
import { EosPanel } from "../eos/EosShared";
import { TableSkeleton } from "../../ui/primitives";
import { percentText } from "./dashboardRecordSets";
import {
  DAY_MS,
  PERIODS,
  bySalesperson,
  funnelKpis,
  funnelStages,
  goalTiles,
  inRange,
  periodRange,
  yearBefore,
  type FunnelEvent,
  type PeriodKey,
} from "./salesFunnel";
import { SalesFunnelLower } from "./SalesFunnelLower";
import "./salesFunnel.css";

const COMPANY = "__company";

/**
 * The company sales funnel from the owner's Banani "Sales Funnel & KPIs"
 * screen (2026-10-14: "we can incorporate this screen"), counted from live
 * events. Pick a period and the whole company or one salesperson; every
 * figure on it follows the pick.
 */
export function SalesFunnelSection() {
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<PeriodKey>("quarter");
  const [personId, setPersonId] = useState(COMPANY);

  // This year (from the start of this week, if that is last year), last
  // year for the goals, the last 90 days for loss reasons and sources, and
  // the next 60 days for deals to close.
  const yearRange = useMemo(() => {
    const year = periodRange("year", now);
    return {
      from: Math.min(year.from, periodRange("week", now).from),
      to: year.to,
    };
  }, [now]);
  const thisYear = useEventRecordsInRange(yearRange);
  const lastYear = useEventsInRange(
    useMemo(() => yearBefore(yearRange), [yearRange]),
  );
  const today = new Date(now).setHours(0, 0, 0, 0);
  const recent = useEventRecordsInRange(
    useMemo(() => ({ from: today - 90 * DAY_MS, to: today + DAY_MS }), [today]),
  );
  const upcoming = useEventsInRange(
    useMemo(() => ({ from: today, to: today + 60 * DAY_MS }), [today]),
  );
  const people = useListPerson();
  const sources = useListReferralSource();

  const personName = useMemo(() => {
    const names = new Map(
      (people ?? []).map((p) => [
        String(p._id),
        `${p.givenName ?? ""} ${p.familyName ?? ""}`.trim() || "Unnamed",
      ]),
    );
    return (id: string) => names.get(id) ?? "Unknown person";
  }, [people]);
  const sourceName = useMemo(() => {
    const names = new Map(
      (sources ?? []).map((s) => [String(s._id), String(s.name ?? "")]),
    );
    return (e: FunnelEvent) =>
      (e.referralSourceId && names.get(String(e.referralSourceId))) ||
      "No lead source";
  }, [sources]);

  const mine = <E extends FunnelEvent>(rows: readonly E[] | undefined) =>
    (rows ?? []).filter(
      (e) =>
        e.deletedAt == null &&
        (personId === COMPANY || String(e.assignedToId ?? "") === personId),
    );

  const range = periodRange(period, now);
  const periodAll = inRange(
    (thisYear ?? []).filter((e) => e.deletedAt == null),
    range,
  ) as FunnelEvent[];
  const periodEvents = mine(periodAll);
  const stages = funnelStages(periodEvents);
  const kpis = funnelKpis(periodEvents);
  const salespeople = bySalesperson(periodAll, personName);
  const goals = goalTiles(mine(thisYear), mine(lastYear), now);
  const widest = Math.max(stages[0]?.count ?? 0, 1);
  const loading =
    thisYear === undefined || lastYear === undefined || people === undefined;
  const periodLabel =
    PERIODS.find((entry) => entry.key === period)?.label.toLowerCase() ?? "";
  const who =
    personId === COMPANY
      ? "the whole company"
      : personId === ""
        ? "events with no salesperson"
        : personName(personId);

  return (
    <div className="mt-5 grid gap-5" data-testid="sales-funnel">
      <EosPanel
        tone="people"
        eyebrow="Sales funnel"
        title={`From inquiry to booked, ${periodLabel}`}
        lead={`Every event is an inquiry; a priced one is a quote; approved or later is won; cancelled is lost. Showing ${who}.`}
        actions={
          <div className="funnel-switch" role="group" aria-label="Period">
            {PERIODS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={period === entry.key}
                onClick={() => setPeriod(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="funnel-people" role="group" aria-label="Salesperson">
          <button
            type="button"
            className="funnel-person"
            aria-pressed={personId === COMPANY}
            onClick={() => setPersonId(COMPANY)}
          >
            Whole company
          </button>
          {(personId === COMPANY ||
          salespeople.some((row) => row.id === personId)
            ? salespeople
            : [...salespeople, { id: personId, name: who }]
          ).map((row) => (
            <button
              key={row.id || "none"}
              type="button"
              className="funnel-person"
              aria-pressed={personId === row.id}
              onClick={() => setPersonId(row.id)}
            >
              {row.name}
            </button>
          ))}
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="funnel-grid">
            <div>
              <p className="funnel-heading">Events by stage</p>
              <div className="funnel-stack">
                <div className="funnel-col">
                  {stages.map((stage) => (
                    <div key={stage.key} className="contents">
                      <div
                        className={`funnel-bar funnel-bar-${stage.key}`}
                        style={{
                          width: `${Math.max(8, (stage.count / widest) * 100)}%`,
                        }}
                      >
                        <span>{stage.label}</span>
                        <strong>{formatCount(stage.count)}</strong>
                      </div>
                      <div className="funnel-bar-note">
                        <span>
                          <b>{formatMoney(stage.value)}</b>
                        </span>
                        <span>
                          {stage.shareOf
                            ? `${percentText(stage.share, "–")} ${stage.shareOf}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="funnel-heading">Funnel numbers</p>
              <div className="funnel-cards">
                <Figure
                  label="Open quotes"
                  value={formatCount(kpis.openCount)}
                  note={`${formatMoney(kpis.openValue)} still to win`}
                />
                <Figure
                  label="Win rate"
                  value={percentText(kpis.winRate, "–")}
                  note="Won of won and lost"
                />
                <Figure
                  label="Booked ahead"
                  value={kpis.daysAhead == null ? "–" : `${kpis.daysAhead} d`}
                  note="Average days from inquiry to the event"
                />
                <Figure
                  label="Average won"
                  value={
                    kpis.averageWon == null ? "–" : formatMoney(kpis.averageWon)
                  }
                  note="Won revenue per won event"
                />
              </div>
              <p className="funnel-heading">By salesperson</p>
              {salespeople.length === 0 ? (
                <p className="text-sm text-ink-3">
                  No events in this period yet.
                </p>
              ) : (
                <div className="funnel-cards">
                  {salespeople.map((row) => (
                    <button
                      key={row.id || "none"}
                      type="button"
                      className="funnel-card"
                      aria-pressed={personId === row.id}
                      onClick={() =>
                        setPersonId(personId === row.id ? COMPANY : row.id)
                      }
                    >
                      <span className="funnel-card-row">
                        <span className="font-semibold text-ink">
                          {row.name}
                        </span>
                        <strong>{formatMoney(row.wonValue)}</strong>
                      </span>
                      <small>
                        Win {percentText(row.winRate, "–")} ·{" "}
                        {formatCount(row.openCount)} open ·{" "}
                        {formatMoney(row.openValue)} in quotes ·{" "}
                        {percentText(row.share, "–")} of won
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </EosPanel>

      <EosPanel
        tone="data"
        eyebrow="Goals"
        title="Won against goal"
        lead="Won revenue by event date. The goal is last year's same period plus 10%."
      >
        <div className="funnel-goals">
          {goals.map((tile) => (
            <div
              key={tile.key}
              className={`eos-stat ${
                tile.toGoal == null
                  ? ""
                  : tile.toGoal >= 100
                    ? "eos-tile-ok"
                    : tile.toGoal >= 85
                      ? "eos-tile-warn"
                      : "eos-tile-brand"
              }`}
            >
              <span>{tile.label}</span>
              <strong>
                {tile.toGoal == null
                  ? formatMoney(tile.won)
                  : `${Math.round(tile.toGoal)}%`}
              </strong>
              <small>
                {tile.goal == null
                  ? "No last-year figure to set a goal"
                  : `${formatMoney(tile.won)} of ${formatMoney(tile.goal)} · last year ${formatMoney(tile.lastYear)}`}
              </small>
            </div>
          ))}
        </div>
      </EosPanel>

      <SalesFunnelLower
        recent={mine(recent)}
        upcoming={mine(upcoming)}
        personName={personName}
        sourceName={sourceName}
        loading={recent === undefined || upcoming === undefined}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="funnel-card">
      <span className="funnel-card-row">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
      <small>{note}</small>
    </div>
  );
}
