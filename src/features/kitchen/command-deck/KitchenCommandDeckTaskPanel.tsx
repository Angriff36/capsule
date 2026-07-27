import { Link } from "react-router-dom";
import { StatusChip } from "../../../ui/primitives";
import { AllergenIconRow } from "../AllergenIconRow";
import { DishPrimaryImage } from "../../attachments/DishPrimaryImage";
import { eventDetailMenuPath, componentPath } from "../kitchenRoutes";
import { prepQuantityLabel } from "../prepQuantityLabel";
import type { KitchenCommandDeckModel } from "./KitchenCommandDeckModel";
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
}: Props) {
  const selections = event ? model.selections(event._id) : [];
  const progress = event
    ? model.progress(event._id)
    : { total: 0, completed: 0, pct: 0 };
  const armed = model.findPerson(armedPersonId);

  if (!event) {
    return (
      <div className="kcd-stage-shell">
        <div className="kcd-empty">
          Select an event on the left to orchestrate prep.
        </div>
      </div>
    );
  }

  return (
    <div className="kcd-stage-shell" data-testid="command-deck-task-panel">
      <header className="kcd-stage-head">
        <div>
          <h2>{event.title}</h2>
          <p>
            {progress.total === 0
              ? "No prep tasks yet — add dishes on the event menu, or sync prep from dish templates."
              : `${progress.completed}/${progress.total} steps · ${progress.pct}% complete`}
          </p>
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

      {selections.length === 0 ? (
        <div className="kcd-empty">
          No dishes on this event yet.{" "}
          <Link to={eventDetailMenuPath(event._id)} className="underline">
            Add dishes on the event menu tab
          </Link>
          .
        </div>
      ) : null}

      {selections.map((selection, index) => {
        const dish = model.dishFor(selection);
        if (!dish) return null;
        const dishTasks = model.tasksForSelection(
          selection._id,
          filter,
          assigneeFilter,
        );
        const assignable = model.assignableTasks(dishTasks);
        const dishDone = dishTasks.filter(
          (t) => t.status === "completed",
        ).length;

        return (
          <section
            key={selection._id}
            className="kcd-dish"
            style={{ ["--delay" as string]: `${100 + index * 55}ms` }}
            data-testid="command-deck-dish"
          >
            <div className="kcd-dish-head">
              <DishPrimaryImage
                storageId={dish.primaryImageStorageId}
                alt={dish.name}
                size="thumb"
                className="rounded-[10px] shadow-md"
              />
              <div className="kcd-dish-copy">
                <div className="flex flex-wrap items-center gap-2">
                  <h3>{dish.name}</h3>
                  <AllergenIconRow codes={dish.allergenSummary} />
                </div>
                <p className="kcd-dish-meta">
                  {selection.quantityServings} servings
                  {" · "}
                  {dishTasks.length
                    ? `${dishDone}/${dishTasks.length} tasks`
                    : "No matching tasks"}
                </p>
              </div>
              {assignable.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy != null || !armedPersonId}
                  title={
                    armed
                      ? `Assign ${assignable.length} tasks to ${model.personLabel(armed)}`
                      : "Arm a cook on the right first"
                  }
                  onClick={() => onAssignDish(assignable)}
                >
                  Assign dish
                  {armed ? ` → ${model.personLabel(armed).split(" ")[0]}` : ""}
                </button>
              ) : null}
            </div>

            {dishTasks.length === 0 ? (
              <p
                className="kcd-task-meta"
                style={{ padding: "0 1rem 0.85rem" }}
              >
                No prep tasks for this dish in the current filters.
              </p>
            ) : (
              <ul className="kcd-task-list">
                {dishTasks.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    model={model}
                    busy={busy}
                    armedPersonId={armedPersonId}
                    componentName={componentName}
                    onAssignTask={onAssignTask}
                    onRelease={onRelease}
                    onClaim={onClaim}
                    onStart={onStart}
                    onComplete={onComplete}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
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
      <div>
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
          {assignee ? ` · ${model.personLabel(assignee)}` : " · unassigned"}
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
      <div className="kcd-task-actions">
        <StatusChip status={String(task.status)} />
        {canAssign ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy != null || !armedPersonId}
            onClick={() => onAssignTask(task)}
          >
            Assign
          </button>
        ) : null}
        {task.status === "pending" ? (
          <button
            type="button"
            className="btn btn-ghost"
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
              className="btn btn-ghost"
              disabled={busy != null}
              onClick={() => onStart(task)}
            >
              Start
            </button>
            <button
              type="button"
              className="btn btn-ghost"
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
            className="btn btn-primary"
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
  return "kcd-task";
}
