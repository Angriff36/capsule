import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useEventDayBriefing,
  useEventDayEvents,
} from "../../../lib/eventDayBriefing";
import { formatCount, formatDate, formatTime } from "../../../lib/format";
import { EmptyState, PageHeader, StatusChip } from "../../../ui/primitives";
import { EosPanel } from "../../eos/EosShared";
import { buildBoard } from "../../eventDay/BattleBoardPage";
import { eventDetailPath } from "../eventRoutes";
import { boardStats, untilText } from "./productionBoardModel";
import {
  CrewColumn,
  RunsAndEquipment,
  TasksColumn,
  TimelinePanel,
  VenueAndFood,
} from "./ProductionBoardSections";
import "./productionBoard.css";

const DAY_MS = 86_400_000;

/**
 * Production board for the weekly production meeting (owner's Banani
 * "Production Board", 2026-10-14). Step through the next two weeks of events;
 * each shows its numbers, run of show, crew, venue, food, tasks, runs and
 * equipment from the same briefing the crew screens read. Changes are made
 * on the event itself; every panel links there.
 */
export function ProductionBoardPage() {
  const [params, setParams] = useSearchParams();
  const all = useEventDayEvents();
  const now = useMemo(() => Date.now(), []);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const upcoming = useMemo(
    () =>
      (all ?? [])
        .filter(
          (event) =>
            event.startsAt != null &&
            event.startsAt >= today &&
            event.startsAt < today + 14 * DAY_MS &&
            !["cancelled", "completed", "closed_out"].includes(
              String(event.stage),
            ),
        )
        .sort((a, b) => Number(a.startsAt) - Number(b.startsAt)),
    [all, today],
  );
  const chosen = params.get("event") ?? upcoming[0]?._id ?? null;
  const briefing = useEventDayBriefing(chosen ?? undefined);
  const board = useMemo(
    () => (briefing ? buildBoard(briefing) : null),
    [briefing],
  );
  const stats = briefing ? boardStats(briefing) : null;

  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("event", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        eyebrow="Events · Production meeting"
        title="Production board"
        lead="One event at a time: the numbers, the run of show, the crew, the venue and food, the tasks, the trucks and the gear. Pick the next event below."
      />

      {all === undefined ? null : upcoming.length === 0 ? (
        <EmptyState
          title="No events in the next two weeks"
          hint="Events show here from today to two weeks out."
        />
      ) : (
        <div className="pb-events mt-5" role="group" aria-label="Event">
          {upcoming.map((event) => (
            <button
              key={event._id}
              type="button"
              className="pb-event"
              aria-pressed={event._id === chosen}
              onClick={() => pick(event._id)}
            >
              <span className="font-mono text-xs">
                {formatDate(event.startsAt)} · {formatTime(event.startsAt)}
              </span>
              <strong>{event.title || "Untitled event"}</strong>
              <span className="text-xs text-ink-3">
                {event.expectedHeadcount
                  ? `${formatCount(event.expectedHeadcount)} guests`
                  : "Guests not set"}
                {event.venueName ? ` · ${event.venueName}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {chosen && briefing === null ? (
        <p className="mt-5 text-sm text-ink-3">This event is unavailable.</p>
      ) : null}

      {board && stats && briefing ? (
        <div className="mt-5 grid gap-5">
          <EosPanel
            tone="traction"
            eyebrow={`${formatDate(board.event.startsAt)} · ${formatTime(board.event.startsAt)}`}
            title={board.event.title || "Untitled event"}
            lead={[
              board.venue?.name ?? board.event.venueName,
              board.event.serviceStyleName,
              board.event.eventType,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              <>
                <StatusChip status={String(board.event.stage ?? "")} />
                <Link
                  className="btn btn-ghost"
                  to={eventDetailPath(board.event._id)}
                >
                  Open event
                </Link>
                <Link
                  className="btn btn-ghost"
                  to={`/event-day/${board.event._id}/battle-board`}
                >
                  Print board
                </Link>
              </>
            }
          >
            <div className="pb-stats">
              <Stat
                label="Guests"
                value={
                  board.event.expectedHeadcount != null
                    ? formatCount(board.event.expectedHeadcount)
                    : "–"
                }
              />
              <Stat
                label="Crew"
                value={`${stats.staffFilled} / ${stats.staffWanted}`}
                tone={
                  stats.staffFilled < stats.staffWanted ? "warn" : undefined
                }
              />
              <Stat
                label="Runs with a vehicle"
                value={`${stats.runsWithVehicle} / ${stats.runs}`}
                tone={stats.runsWithVehicle < stats.runs ? "warn" : undefined}
              />
              <Stat label="Menu items" value={String(stats.menuItems)} />
              <Stat
                label="Packed"
                value={`${stats.packed} / ${stats.packLines}`}
                tone={stats.packed < stats.packLines ? "warn" : "ok"}
              />
              <Stat
                label="Starts"
                value={untilText(board.event.startsAt, board.event.endsAt, now)}
              />
            </div>
          </EosPanel>

          <TimelinePanel briefing={briefing} board={board} now={now} />

          <div className="pb-grid">
            <CrewColumn board={board} />
            <VenueAndFood briefing={briefing} board={board} />
            <TasksColumn board={board} stats={stats} />
          </div>

          <RunsAndEquipment briefing={briefing} board={board} />
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className={`eos-stat${tone ? ` eos-tile-${tone}` : ""}`}>
      <span>{label}</span>
      <strong className="text-xl">{value}</strong>
    </div>
  );
}
