import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useListAccountabilitySeat,
  useListCoreProcess,
  useListLeadershipItem,
  useListLeadershipMeeting,
  useListScorecardTarget,
} from "@/lib/manifest-convex-react";
import { PageHeader } from "@/ui/primitives";
import { ChevronRightIcon } from "@/ui/icons";
import {
  liveMeetings,
  type LeadershipItemRow,
  type LeadershipMeetingRow,
} from "../reports/leadershipHistory";
import {
  scorecardRows,
  type ScorecardTargetRow,
} from "../reports/scorecardMeasures";
import { useScorecardSources } from "../reports/useScorecardSources";
import { EosJourney } from "./EosJourney";
import { EosStartHere } from "./EosStartHere";
import { EosTabs, ProgressBar } from "./EosShared";
import {
  EOS_COMPONENTS,
  EOS_PATHS,
  daysLeftInQuarter,
  quarterLabel,
  quarterStart,
  todoCompletion,
  type EosComponent,
} from "./eosModel";
import { OrganizationalCheckup } from "./OrganizationalCheckup";
import { PlanningSession } from "./PlanningSession";
import { useEosJourney } from "./useEosJourney";
import { useCompanyVision, useEosViewer, useVisionItems } from "./useEosData";

type Stat = {
  value: string;
  label: string;
  progress: number | null;
  note: string;
};

/**
 * EOS home: four things in Traction order, then the six parts as boxes.
 * Checkup and quarterly planning wait until seats have names.
 */
export function EosOverviewPage() {
  const now = useMemo(() => new Date(), []);
  const { canEdit } = useEosViewer();
  const journey = useEosJourney(now);
  const vision = useCompanyVision();
  const items = useVisionItems();
  const seats = useListAccountabilitySeat();
  const processes = useListCoreProcess();
  const leadership = useListLeadershipItem() as LeadershipItemRow[] | undefined;
  const meetings = useListLeadershipMeeting() as
    LeadershipMeetingRow[] | undefined;
  const targets = useListScorecardTarget();
  const { sources } = useScorecardSources(now);
  const scorecard = useMemo(
    () => scorecardRows(sources, (targets ?? []) as ScorecardTargetRow[], now),
    [sources, targets, now],
  );

  const stats = useMemo((): Record<EosComponent, Stat> => {
    const written = EosJourney.countVisionParts(vision, items);

    const liveSeats = (seats ?? []).filter((row) => row.placedAt != null);
    const openSeats = liveSeats.filter((row) => !row.personId).length;

    const tracked = scorecard.filter((row) => row.target != null);
    const onTrack = tracked.filter((row) => row.status === "on_track").length;

    const rows = leadership ?? [];
    const issues = rows.filter(
      (row) => row.kind === "issue" && row.status === "open",
    );
    const weekly = issues.filter((row) => row.parkedAt == null).length;
    const since = quarterStart(now).getTime();
    const solved = rows.filter(
      (row) =>
        row.kind === "issue" &&
        row.status === "done" &&
        (row.closedAt ?? 0) >= since,
    ).length;

    const live = (processes ?? []).filter((row) => row.namedAt != null);
    const followed = live.filter(
      (row) => row.stage === "followed_by_all",
    ).length;

    const rocks = rows.filter(
      (row) =>
        row.kind === "rock" &&
        (row.status === "open" || (row.closedAt ?? 0) >= since),
    );
    const rocksGood = rocks.filter(
      (row) => row.status === "done" || row.track === "on_track",
    ).length;
    const todos = todoCompletion(rows, now.getTime());
    const lastMeeting = liveMeetings(meetings ?? [])[0];

    return {
      vision: {
        value: `${written}/10`,
        label: "V/TO parts written",
        progress: written * 10,
        note: written === 10 ? "Share it with everyone" : "Finish the V/TO",
      },
      people: {
        value: String(liveSeats.length),
        label: liveSeats.length === 1 ? "seat" : "seats",
        progress:
          liveSeats.length === 0
            ? 0
            : ((liveSeats.length - openSeats) / liveSeats.length) * 100,
        note:
          liveSeats.length === 0
            ? "Draw the job chart"
            : openSeats === 0
              ? "Everyone named"
              : `${openSeats} with no one yet`,
      },
      data: {
        value: `${onTrack}/${tracked.length}`,
        label: "numbers on track",
        progress: tracked.length === 0 ? 0 : (onTrack / tracked.length) * 100,
        note:
          tracked.length === 0
            ? "Set scorecard goals"
            : `${tracked.length} ${tracked.length === 1 ? "number" : "numbers"} with goals`,
      },
      issues: {
        value: String(weekly),
        label: "open this week",
        progress: null,
        note: `${issues.length - weekly} long-term · ${solved} solved this quarter`,
      },
      process: {
        value: `${followed}/${live.length}`,
        label: "followed by all",
        progress: live.length === 0 ? 0 : (followed / live.length) * 100,
        note:
          live.length === 0
            ? "Name the core processes"
            : `${live.length} core ${live.length === 1 ? "process" : "processes"}`,
      },
      traction: {
        value: `${rocksGood}/${rocks.length}`,
        label: "Rocks on track or done",
        progress: rocks.length === 0 ? 0 : (rocksGood / rocks.length) * 100,
        note:
          [
            todos.percent == null ? null : `To-dos ${todos.percent}% done`,
            lastMeeting?.rating != null
              ? `last L10 rated ${lastMeeting.rating}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Set this quarter's Rocks",
      },
    };
  }, [items, vision, seats, scorecard, leadership, processes, meetings, now]);

  return (
    <div className="operations-stage supply-stage">
      <EosTabs />
      <PageHeader
        eyebrow="EOS · Entrepreneurial Operating System"
        title="How Mangia runs"
        lead="Do the four steps below, in order."
        facts={[
          { label: "Quarter", value: quarterLabel(now) },
          { label: "Days left", value: daysLeftInQuarter(now) },
        ]}
      />
      <div className="eos-stack">
        {journey ? <EosStartHere journey={journey} canEdit={canEdit} /> : null}
        <div className="eos-components">
          {EOS_COMPONENTS.map((component) => {
            const stat = stats[component.key];
            return (
              <Link
                key={component.key}
                to={component.path}
                className={`eos-component eos-tone-${component.key}`}
              >
                <div>
                  <span className="eos-eyebrow">{component.tools}</span>
                  <h3>{component.name}</h3>
                  <p className="eos-component-question">{component.question}</p>
                </div>
                <div className="grid content-end gap-1.5">
                  <span className="eos-component-stat">
                    <strong>{stat.value}</strong>
                    {stat.label}
                  </span>
                  {stat.progress != null ? (
                    <ProgressBar
                      value={stat.progress}
                      label={`${component.name}: ${stat.label}`}
                    />
                  ) : null}
                </div>
                <span className="eos-component-foot">
                  {stat.note}
                  <ChevronRightIcon width={14} height={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
        <section className="eos-panel eos-tone-traction">
          <div className="eos-panel-head">
            <div>
              <span className="eos-eyebrow">The EOS rhythm</span>
              <h2>What happens when</h2>
            </div>
          </div>
          <div className="eos-panel-body grid gap-3 sm:grid-cols-3">
            <Rhythm
              when="Every week"
              what="The L10 meeting: scorecard, Rocks, headlines, to-dos, then solve the top issues."
              to={EOS_PATHS.l10}
              action="Open the L10"
            />
            <Rhythm
              when="Every 90 days"
              what="Close out the Rocks, set new ones, work the long-term issues, retake the checkup."
              to={
                journey?.showLaterTools()
                  ? "?session=quarterly#planning-session"
                  : null
              }
              action={
                journey?.showLaterTools()
                  ? "Plan the quarterly session"
                  : "After seats have names"
              }
            />
            <Rhythm
              when="Every year"
              what="Review the V/TO, set the 1-year plan and goals, check the People Analyzer."
              to={
                journey?.showLaterTools()
                  ? "?session=annual#planning-session"
                  : null
              }
              action={
                journey?.showLaterTools()
                  ? "Plan the annual session"
                  : "After seats have names"
              }
            />
          </div>
        </section>
        {journey?.showLaterTools() ? (
          <>
            <OrganizationalCheckup />
            <PlanningSession
              rows={leadership ?? []}
              visionWritten={stats.vision.progress! / 10}
              oneYearGoals={
                (items ?? []).filter((row) => row.section === "one_year_goal")
                  .length
              }
              now={now}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Rhythm({
  when,
  what,
  to,
  action,
}: {
  when: string;
  what: string;
  to: string | null;
  action: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-inset p-3">
      <p className="font-semibold text-ink">{when}</p>
      <p className="mt-1 text-sm text-ink-2">{what}</p>
      {to ? (
        <Link to={to} className="btn-link mt-2 inline-block text-sm">
          {action} →
        </Link>
      ) : (
        <p className="mt-2 text-sm text-ink-3">{action}</p>
      )}
    </div>
  );
}
