import { Link } from "react-router-dom";
import type { EventDayBriefing } from "../../../lib/eventDayBriefing";
import { formatCount, formatTime } from "../../../lib/format";
import { StatusChip } from "../../../ui/primitives";
import { EosPanel } from "../../eos/EosShared";
import type { buildBoard } from "../../eventDay/BattleBoardPage";
import { categoryLabel } from "../../eventDay/runOfShowModel";
import { CULINARY_ALLERGENS } from "../../kitchen/CulinaryAllergenVocabulary";
import { displayEventMenuNotes } from "../eventMenuLineFields";
import { eventDetailPath } from "../eventRoutes";
import { buildTimeline, type BoardStats } from "./productionBoardModel";

type Board = ReturnType<typeof buildBoard>;

const LANE_PX = 34;
const allergenName = (code: string) =>
  CULINARY_ALLERGENS.find((row) => row.code === code)?.label ?? code;

const personName = (board: Board, id: string | null) => {
  const person = id ? board.people.get(id) : undefined;
  return (
    [person?.givenName, person?.familyName].filter(Boolean).join(" ") || "Staff"
  );
};

const windowText = (start: number | null, end: number | null) =>
  start == null
    ? "Time not set"
    : end != null
      ? `${formatTime(start)} – ${formatTime(end)}`
      : formatTime(start);

export function TimelinePanel({
  briefing,
  board,
  now,
}: {
  briefing: EventDayBriefing;
  board: Board;
  now: number;
}) {
  const timeline = buildTimeline(
    briefing.activities,
    board.event.startsAt,
    board.event.endsAt,
  );
  const span = timeline ? timeline.to - timeline.from : 1;
  const at = (time: number) =>
    timeline ? ((time - timeline.from) / span) * 100 : 0;
  return (
    <EosPanel
      tone="process"
      eyebrow="Run of show"
      title="Event timeline"
      lead="Every timed step of the day, laid end to end. Steps that are done are faded."
      actions={
        <Link
          className="btn btn-ghost"
          to={`/event-day/${board.event._id}/run`}
        >
          Open run of show
        </Link>
      }
    >
      {!timeline ? (
        <p className="text-sm text-ink-3">
          No timed steps yet. Add them on the event&apos;s Timeline tab.
        </p>
      ) : (
        <>
          <div className="pb-scale" aria-hidden="true">
            {timeline.hours.map((hour) => (
              <span key={hour}>{formatTime(hour)}</span>
            ))}
          </div>
          <div
            className="pb-track"
            style={{ height: `${timeline.lanes * LANE_PX + 6}px` }}
          >
            {timeline.bars.map((bar) => (
              <div
                key={bar.row._id}
                className={`pb-bar pb-cat-${bar.row.category ?? "other"}`}
                data-done={bar.row.completedAt != null || undefined}
                title={`${bar.row.name ?? ""} · ${windowText(bar.start, bar.end)}`}
                style={{
                  left: `${at(bar.start)}%`,
                  width: `${Math.max(at(bar.end) - at(bar.start), 1.5)}%`,
                  top: `${bar.lane * LANE_PX + 4}px`,
                }}
              >
                {bar.row.name || categoryLabel(bar.row.category) || "Step"}
              </div>
            ))}
            {now >= timeline.from && now <= timeline.to ? (
              <div
                className="pb-now"
                style={{ left: `${at(now)}%` }}
                aria-label={`Now, ${formatTime(now)}`}
              />
            ) : null}
          </div>
        </>
      )}
    </EosPanel>
  );
}

export function CrewColumn({ board }: { board: Board }) {
  return (
    <div className="pb-col">
      <EosPanel
        tone="people"
        eyebrow="Staffing"
        title={`Crew (${board.staff.length})`}
        actions={
          <Link
            className="btn btn-ghost btn-sm"
            to={eventDetailPath(board.event._id, "staffing")}
          >
            Edit
          </Link>
        }
      >
        {board.staff.length === 0 && board.staffNeeds.length === 0 ? (
          <p className="text-sm text-ink-3">Nobody is on this event yet.</p>
        ) : null}
        {board.staff.map((row) => (
          <div key={row._id} className="pb-card">
            <div className="pb-card-head">
              <strong>{personName(board, row.personId)}</strong>
              <StatusChip status={String(row.status ?? "")} />
            </div>
            <span>
              {row.role ?? "Crew"} · {windowText(row.startsAt, row.endsAt)}
            </span>
          </div>
        ))}
        {board.staffNeeds.map((row) => (
          <div key={row._id} className="pb-card" data-open="">
            <div className="pb-card-head">
              <strong>Still needed</strong>
              <span className="pb-chip" data-tone="danger">
                Open
              </span>
            </div>
            <span>
              {row.role ?? "Crew"} · {windowText(row.startsAt, row.endsAt)}
            </span>
          </div>
        ))}
      </EosPanel>
    </div>
  );
}

export function VenueAndFood({
  briefing,
  board,
}: {
  briefing: EventDayBriefing;
  board: Board;
}) {
  const courses = [...board.courses.entries()];
  const dishName = (id: string | null) =>
    briefing.dishes.find((dish) => dish._id === id)?.name || "Dish";
  return (
    <div className="pb-col">
      <EosPanel
        tone="vision"
        eyebrow="Venue"
        title={board.venue?.name ?? board.event.venueName ?? "No venue yet"}
        lead={board.event.venueAddress ?? undefined}
        actions={
          <Link
            className="btn btn-ghost btn-sm"
            to={eventDetailPath(board.event._id, "layouts")}
          >
            Layout
          </Link>
        }
      >
        {board.venueTraits.length === 0 &&
        board.layout.length === 0 &&
        board.venueNotes.length === 0 ? (
          <p className="text-sm text-ink-3">
            No layout or venue notes yet. Add the layout on the event.
          </p>
        ) : null}
        {board.venueTraits.length ? (
          <div className="pb-chips">
            {board.venueTraits.map((trait) => (
              <span key={String(trait)} className="pb-chip">
                {trait}
              </span>
            ))}
          </div>
        ) : null}
        {board.layout.length ? (
          <>
            <p className="pb-heading mt-3">Layout</p>
            <div className="pb-wide">
              {board.layout.map((row) => (
                <div key={row._id} className="pb-card">
                  <strong className="text-ink">{row.type ?? "Area"}</strong>
                  {row.instructions ? <span>{row.instructions}</span> : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
        {board.venueNotes.map(([label, text]) => (
          <p key={label} className="mt-2 text-sm text-ink-2">
            <b className="text-ink">{label}:</b> {text}
          </p>
        ))}
      </EosPanel>

      <EosPanel
        tone="data"
        eyebrow="Food"
        title="Food run sheet"
        lead="Each course with its count and the allergens its recipes carry."
        actions={
          <Link
            className="btn btn-ghost btn-sm"
            to={eventDetailPath(board.event._id, "menu")}
          >
            Menu
          </Link>
        }
      >
        {courses.length === 0 ? (
          <p className="text-sm text-ink-3">No dishes on the menu yet.</p>
        ) : (
          <div className="supply-table-wrap">
            <table className="data-table table-even phone-cards">
              <thead>
                <tr>
                  <th className="col-state">Course</th>
                  <th className="col-wide">Dish</th>
                  <th className="col-num">Qty</th>
                  <th>Allergens</th>
                </tr>
              </thead>
              <tbody>
                {courses.flatMap(([course, rows]) =>
                  rows.map((row) => {
                    const dish = board.reports.get(String(row.dishId));
                    const name = dishName(row.dishId);
                    return (
                      <tr key={row._id}>
                        <td data-label="Course">{course}</td>
                        <td data-label="Dish">
                          <strong>{name}</strong>
                          {displayEventMenuNotes(row.specialInstructions) ? (
                            <small>
                              {displayEventMenuNotes(row.specialInstructions)}
                            </small>
                          ) : null}
                        </td>
                        <td className="num" data-label="Qty">
                          {row.quantityServings != null
                            ? formatCount(row.quantityServings)
                            : "–"}
                        </td>
                        <td data-label="Allergens">
                          <div className="pb-chips">
                            {dish?.codes.length ? (
                              dish.codes.map((code) => (
                                <span
                                  key={code}
                                  className="pb-chip"
                                  data-tone="danger"
                                >
                                  {allergenName(code)}
                                </span>
                              ))
                            ) : (
                              <span className="text-ink-3">None found</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </EosPanel>
    </div>
  );
}

export function TasksColumn({
  board,
  stats,
}: {
  board: Board;
  stats: BoardStats;
}) {
  const open = board.timeline.filter((row) => row.completedAt == null);
  const done = board.timeline.filter((row) => row.completedAt != null);
  const row = (task: (typeof board.timeline)[number]) => (
    <div
      key={task._id}
      className="pb-task"
      data-done={task.completedAt != null || undefined}
    >
      <time>{task.startsAt != null ? formatTime(task.startsAt) : "—"}</time>
      <span className="min-w-0">
        {task.name || categoryLabel(task.category) || "Step"}
        <span className="block text-xs text-ink-3">{board.whoLabel(task)}</span>
      </span>
    </div>
  );
  return (
    <div className="pb-col">
      <EosPanel
        tone="issues"
        eyebrow="Tasks"
        title={`${stats.tasksDone} of ${stats.tasks} done`}
        actions={
          <Link
            className="btn btn-ghost btn-sm"
            to={eventDetailPath(board.event._id, "timeline")}
          >
            Edit
          </Link>
        }
      >
        <p className="pb-heading">To do ({open.length})</p>
        {open.length ? (
          open.map(row)
        ) : (
          <p className="text-sm text-ink-3">Nothing left to do.</p>
        )}
        {done.length ? (
          <>
            <p className="pb-heading">Done ({done.length})</p>
            {done.map(row)}
          </>
        ) : null}
      </EosPanel>
    </div>
  );
}

export function RunsAndEquipment({
  briefing,
  board,
}: {
  briefing: EventDayBriefing;
  board: Board;
}) {
  const vehicleName = (id: string | null) => {
    const vehicle = briefing.vehicles.find((row) => row._id === id);
    return vehicle
      ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"
      : "No vehicle yet";
  };
  return (
    <div className="pb-grid">
      <div className="pb-col pb-span2">
        <EosPanel
          tone="people"
          eyebrow="Logistics"
          title="Vehicles and runs"
          lead="Each delivery run: the vehicle, the driver, the window and where it goes."
          actions={
            <Link
              className="btn btn-ghost btn-sm"
              to={`${eventDetailPath(board.event._id, "equipment")}#deliveries`}
            >
              Edit
            </Link>
          }
        >
          {board.deliveries.length === 0 ? (
            <p className="text-sm text-ink-3">No delivery runs yet.</p>
          ) : (
            <div className="pb-wide">
              {board.deliveries.map((row) => (
                <div key={row._id} className="pb-card">
                  <div className="pb-card-head">
                    <strong>{vehicleName(row.vehicleId)}</strong>
                    <StatusChip status={String(row.status ?? "")} />
                  </div>
                  <span>
                    Driver:{" "}
                    {row.driverId
                      ? personName(board, row.driverId)
                      : "Not assigned"}
                  </span>
                  <span>
                    {windowText(row.windowStartsAt, row.windowEndsAt)}
                  </span>
                  {row.destination ? (
                    <span className="text-ink-3">{row.destination}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </EosPanel>
      </div>
      <div className="pb-col">
        <EosPanel
          tone="process"
          eyebrow="Equipment"
          title={`Equipment (${board.equipment.length})`}
          actions={
            <Link
              className="btn btn-ghost btn-sm"
              to={`${eventDetailPath(board.event._id, "equipment")}#pack-list`}
            >
              Pack list
            </Link>
          }
        >
          {board.equipment.length === 0 ? (
            <p className="text-sm text-ink-3">No equipment held yet.</p>
          ) : (
            board.equipment.map((row) => (
              <div key={row._id} className="pb-card">
                <div className="pb-card-head">
                  <strong>
                    {board.equipmentName(row.equipmentId)}
                    {row.quantity != null ? ` × ${row.quantity}` : ""}
                  </strong>
                  <StatusChip status={String(row.status ?? "")} />
                </div>
              </div>
            ))
          )}
        </EosPanel>
      </div>
    </div>
  );
}
