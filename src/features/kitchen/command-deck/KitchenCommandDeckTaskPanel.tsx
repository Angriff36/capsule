import { Link } from "react-router-dom";
import { formatCountNoun, formatDate, formatTime } from "../../../lib/format";
import { StatusChip } from "../../../ui/primitives";
import { AllergenIconRow } from "../AllergenIconRow";
import { DishPrimaryImage } from "../../attachments/DishPrimaryImage";
import { eventDetailMenuPath, componentPath } from "../kitchenRoutes";
import { prepQuantityLabel } from "../prepQuantityLabel";
import {
  commandDeckFilterNoun,
  type KitchenCommandDeckModel,
} from "./KitchenCommandDeckModel";
import type {
  CommandDeckFilter,
  EventLike,
  PrepTaskLike,
} from "./KitchenCommandDeckTypes";

type Props = Readonly<{
  model: KitchenCommandDeckModel;
  event: EventLike | undefined;
  filter: CommandDeckFilter;
  assigneeFilter: string;
  armedPersonId: string | null;
  busy: string | null;
  prepSyncReady: boolean;
  componentName: (componentId: string | null | undefined) => string | null;
  onAssignTask: (task: PrepTaskLike) => void;
  onAssignDish: (tasks: PrepTaskLike[]) => void;
  onRelease: (task: PrepTaskLike) => void;
  onClaim: (task: PrepTaskLike) => void;
  onStart: (task: PrepTaskLike) => void;
  onComplete: (task: PrepTaskLike) => void;
  onSyncPrep: () => void;
  /** Empty horizon: the first event after the window, offered as a jump. */
  nextEvent?: EventLike | null;
  onJumpToEvent?: (event: EventLike) => void;
  horizonLabel?: string;
  crewWithLoad?: number;
}>;

export function KitchenCommandDeckTaskPanel({
  model,
  event,
  filter,
  assigneeFilter,
  armedPersonId,
  busy,
  prepSyncReady,
  componentName,
  onAssignTask,
  onAssignDish,
  onRelease,
  onClaim,
  onStart,
  onComplete,
  onSyncPrep,
  nextEvent,
  onJumpToEvent,
  horizonLabel,
  crewWithLoad = 0,
}: Props) {
  if (!event) {
    return (
      <div className="kcd-stage-shell" data-testid="command-deck-task-panel">
        <header className="kcd-stage-head">
          <div>
            <h2>Nothing to prep in this window</h2>
            <p>{horizonLabel ?? "No events fall inside the 7-day horizon."}</p>
          </div>
        </header>
        <div className="kcd-quiet-grid">
          <div className="kcd-quiet-card">
            <p className="kcd-quiet-label">Next event</p>
            {nextEvent ? (
              <>
                <p className="kcd-quiet-value">{nextEvent.title}</p>
                <p className="kcd-quiet-meta">
                  {formatDate(nextEvent.startsAt)} ·{" "}
                  {formatTime(nextEvent.startsAt)}
                  {nextEvent.expectedHeadcount != null
                    ? ` · ${nextEvent.expectedHeadcount} guests`
                    : ""}
                </p>
                {onJumpToEvent ? (
                  <button
                    type="button"
                    className="btn btn-primary mt-3"
                    onClick={() => onJumpToEvent(nextEvent)}
                    data-testid="command-deck-jump-next-event"
                  >
                    Jump to that week
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="kcd-quiet-value">None booked</p>
                <p className="kcd-quiet-meta">
                  No upcoming events on the calendar.
                </p>
                <Link to="/events/new" className="btn btn-primary mt-3">
                  New event
                </Link>
              </>
            )}
          </div>
          <div className="kcd-quiet-card">
            <p className="kcd-quiet-label">Crew with open prep</p>
            <p className="kcd-quiet-value">{crewWithLoad}</p>
            <p className="kcd-quiet-meta">
              {crewWithLoad === 0
                ? "Nobody holds prep for this window."
                : "See the crew rail for who is carrying work."}
            </p>
          </div>
          <div className="kcd-quiet-card">
            <p className="kcd-quiet-label">How this board works</p>
            <ol className="kcd-quiet-steps">
              <li>Pick a week with Earlier / Later or the date.</li>
              <li>Select an event from the list to orchestrate prep.</li>
              <li>Arm a cook on the right, then assign steps or dishes.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const selections = model.selections(event._id);
  const filterActive = model.filterIsActive(filter, assigneeFilter);
  const armed = model.findPerson(armedPersonId);
  const headline = model.filteredHeadline(event._id, filter, assigneeFilter);
  const progress = model.progress(event._id);
  const visible = model.filterTasks(event._id, filter, assigneeFilter);
  const active = visible.filter((t) => t.status === "in_progress");
  const blocked = visible.filter((t) => t.status === "blocked");
  const rowProps = {
    model,
    busy,
    armedPersonId,
    componentName,
    onAssignTask,
    onRelease,
    onClaim,
    onStart,
    onComplete,
  };

  return (
    <div className="kcd-stage-shell" data-testid="command-deck-task-panel">
      <header className="kcd-stage-head">
        <div className="min-w-0">
          <h2>{event.title}</h2>
          <p>
            {formatDate(event.startsAt)} · {formatTime(event.startsAt)}
            {event.expectedHeadcount != null
              ? ` · ${event.expectedHeadcount} guests`
              : ""}
            {" · "}
            {headline}
          </p>
          {progress.total > 0 ? (
            <div className="kcd-progress kcd-progress-lg" aria-hidden="true">
              <i style={{ width: `${progress.pct}%` }} />
            </div>
          ) : null}
        </div>
        <div className="kcd-stage-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy != null || !prepSyncReady || selections.length === 0}
            onClick={onSyncPrep}
            title="Create missing prep steps from each dish’s task templates"
          >
            Sync prep
          </button>
          <Link to={eventDetailMenuPath(event._id)} className="btn btn-ghost">
            Event menu
          </Link>
        </div>
      </header>

      <div className="kcd-lanes">
        <section className="kcd-lane" data-lane="active">
          <h3>
            Active work <span>{active.length}</span>
          </h3>
          {active.length === 0 ? (
            <p className="kcd-lane-empty">Nothing in progress right now.</p>
          ) : (
            <ul className="kcd-task-list">
              {active.map((task) => (
                <TaskRow key={task._id} task={task} {...rowProps} />
              ))}
            </ul>
          )}
        </section>
        <section className="kcd-lane" data-lane="blocked">
          <h3>
            Blocked <span>{blocked.length}</span>
          </h3>
          {blocked.length === 0 ? (
            <p className="kcd-lane-empty">No blocked steps.</p>
          ) : (
            <ul className="kcd-task-list">
              {blocked.map((task) => (
                <TaskRow key={task._id} task={task} {...rowProps} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="kcd-lane" data-lane="todo">
        <h3>
          To do by dish <span>{selections.length}</span>
        </h3>

        {selections.length === 0 ? (
          <div className="kcd-empty">
            No dishes on this event yet.{" "}
            <Link to={eventDetailMenuPath(event._id)} className="underline">
              Add dishes on the event menu tab
            </Link>
            .
          </div>
        ) : null}

        {selections.map((selection) => {
          const dish = model.dishFor(selection);
          if (!dish) return null;
          const dishTasks = model
            .tasksForSelection(selection._id, filter, assigneeFilter)
            .filter(
              (t) => t.status !== "in_progress" && t.status !== "blocked",
            );
          const allDishTasks = model.tasksForSelection(
            selection._id,
            "all",
            "",
          );
          const assignable = model.assignableTasks(dishTasks);
          const dishDone = allDishTasks.filter(
            (t) => t.status === "completed",
          ).length;
          const matchingLine = filterActive
            ? `${dishTasks.length} of ${allDishTasks.length} matching`
            : allDishTasks.length
              ? `${dishDone}/${allDishTasks.length} steps done`
              : "No prep steps yet";
          const emptyLine = filterActive
            ? `${dishTasks.length} of ${allDishTasks.length} steps match ${
                assigneeFilter ? "this assignee" : commandDeckFilterNoun(filter)
              }.`
            : allDishTasks.length
              ? "Every remaining step is active or blocked (see above)."
              : "No prep tasks for this dish yet — use Sync prep.";

          return (
            <section
              key={selection._id}
              className="kcd-dish"
              data-testid="command-deck-dish"
            >
              <div className="kcd-dish-head">
                <DishPrimaryImage
                  storageId={dish.primaryImageStorageId}
                  alt={dish.name}
                  size="thumb"
                  className="rounded-sm"
                />
                <div className="kcd-dish-copy">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4>{dish.name}</h4>
                    <AllergenIconRow codes={dish.allergenSummary} />
                  </div>
                  <p className="kcd-dish-meta">
                    {selection.quantityServings} servings
                    {" · "}
                    {matchingLine}
                  </p>
                </div>
                {assignable.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy != null || !armedPersonId}
                    title={
                      armed
                        ? `Assign ${formatCountNoun(assignable.length, "task")} to ${model.personLabel(armed)}`
                        : "Arm a cook on the right first"
                    }
                    onClick={() => onAssignDish(assignable)}
                  >
                    Assign dish
                    {armed
                      ? ` → ${model.personLabel(armed).split(" ")[0]}`
                      : ""}
                  </button>
                ) : null}
              </div>

              {dishTasks.length === 0 ? (
                <p className="kcd-lane-empty">{emptyLine}</p>
              ) : (
                <ul className="kcd-task-list">
                  {dishTasks.map((task) => (
                    <TaskRow key={task._id} task={task} {...rowProps} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}

function TaskRow({
  task,
  model,
  busy,
  armedPersonId,
  componentName,
  onAssignTask,
  onRelease,
  onClaim,
  onStart,
  onComplete,
}: Readonly<{
  task: PrepTaskLike;
  model: KitchenCommandDeckModel;
  busy: string | null;
  armedPersonId: string | null;
  componentName: (componentId: string | null | undefined) => string | null;
  onAssignTask: (task: PrepTaskLike) => void;
  onRelease: (task: PrepTaskLike) => void;
  onClaim: (task: PrepTaskLike) => void;
  onStart: (task: PrepTaskLike) => void;
  onComplete: (task: PrepTaskLike) => void;
}>) {
  const assignee = model.findPerson(task.assignedToId);
  const linkedComponent = componentName(task.componentId);
  const canAssign = task.status === "pending" || task.status === "claimed";
  const rowClass = taskRowClass(task.status);

  return (
    <li className={rowClass} data-testid="command-deck-task">
      <div className="kcd-task-main">
        <p className="kcd-task-name">
          <span
            className="kcd-status-dot"
            data-status={task.status}
            aria-hidden="true"
          />
          <span>{task.name}</span>
        </p>
        <p className="kcd-task-meta">
          {prepQuantityLabel(task.quantity, String(task.unit))}{" "}
          {String(task.unit)}
          {task.category ? ` · ${humanCategory(task.category)}` : ""}
          {task.station ? ` · ${task.station}` : ""}
          {linkedComponent && task.componentId ? (
            <>
              {" · "}
              <Link to={componentPath(task.componentId)}>
                {linkedComponent}
              </Link>
            </>
          ) : null}
        </p>
        {task.specialInstructions ? (
          <p className="kcd-task-note">{task.specialInstructions}</p>
        ) : null}
        {task.notes ? <p className="kcd-task-note">{task.notes}</p> : null}
      </div>
      <dl className="kcd-task-facts">
        <div>
          <dt>Due</dt>
          <dd>
            {task.dueAt != null
              ? `${formatDate(task.dueAt)} ${formatTime(task.dueAt)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd className={assignee ? undefined : "kcd-unassigned"}>
            {assignee ? model.personLabel(assignee) : "Unassigned"}
          </dd>
        </div>
      </dl>
      <div className="kcd-task-actions">
        <StatusChip status={String(task.status)} />
        {canAssign ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy != null || !armedPersonId}
            onClick={() => onAssignTask(task)}
          >
            Assign
          </button>
        ) : null}
        {task.status === "pending" ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy != null}
            onClick={() => onClaim(task)}
          >
            Claim
          </button>
        ) : null}
        {task.status === "claimed" ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy != null}
              onClick={() => onStart(task)}
            >
              Start
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy != null}
              onClick={() => onRelease(task)}
            >
              Release
            </button>
          </>
        ) : null}
        {task.status === "in_progress" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy != null}
            onClick={() => onComplete(task)}
          >
            Complete
          </button>
        ) : null}
      </div>
    </li>
  );
}

function humanCategory(category: string): string {
  return category.replaceAll("_", " ");
}

function taskRowClass(status: string): string {
  if (status === "completed") return "kcd-task is-done";
  if (status === "in_progress") return "kcd-task is-doing";
  if (status === "blocked") return "kcd-task is-blocked";
  return "kcd-task";
}
