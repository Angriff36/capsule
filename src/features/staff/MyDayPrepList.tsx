import { CulinaryEntityLink } from "../kitchen/CulinaryEntityLink";
import { PrepTaskRow } from "../kitchen/PrepTaskRow";
import { prepMadeSoFarLabel } from "../kitchen/prepTiming";
import {
  prepTaskDependencyLabel,
  prepTaskDependencySummary,
  type PrepTaskDependencyLink,
} from "../production/PrepTaskDependencies";

type PrepTask = {
  _id: string;
  version: number;
  eventDishId: string;
  eventId: string;
  dishId?: string | null;
  dishTaskId?: string | null;
  componentId?: string | null;
  name?: string;
  status: string;
  quantity: number;
  completedQuantity?: number | null;
  unit: string;
  station?: string | null;
  dueAt?: number | null;
  specialInstructions?: string | null;
  blockReason?: string | null;
  deletedAt?: number | null;
};
type EventDish = {
  _id: string;
  dishId: string;
  quantityServings: number;
  course?: string | null;
};
type Props = {
  tasks: PrepTask[];
  allTasks: PrepTask[];
  /** Every prep task the reader can see: other cooks' finished work and the
   * tasks this work waits on. */
  everyTask?: PrepTask[];
  dependencies?: PrepTaskDependencyLink[];
  dishes?: { _id: string; name: string }[];
  eventDishes?: EventDish[];
  events?: { _id: string; title: string }[];
  busy: string | null;
  /** Clock for the late flag; My Day ticks it every 30 seconds. */
  now: number;
  /** Tasks whose Done is saved on this device, waiting to send. */
  queuedCompleteIds: ReadonlySet<string>;
  perform: (
    key: string,
    command: string,
    label: string,
    args: Record<string, unknown>,
  ) => void;
};

/** Keep every instruction beneath its real EventDish, including repeated dishes at different events. */
export function MyDayPrepList({
  tasks,
  allTasks,
  everyTask,
  dependencies,
  dishes,
  eventDishes,
  events,
  busy,
  now,
  queuedCompleteIds,
  perform,
}: Props) {
  const known = everyTask ?? allTasks;
  const groups = new Map<string, PrepTask[]>();
  for (const task of tasks) {
    const key = JSON.stringify([task.eventId, task.eventDishId || task._id]);
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  const dishesById = new Map(dishes?.map((dish) => [dish._id, dish]));
  const entriesById = new Map(eventDishes?.map((entry) => [entry._id, entry]));
  const eventsById = new Map(events?.map((event) => [event._id, event]));
  const totals = new Map<string, { total: number; completed: number }>();
  for (const task of allTasks) {
    if (task.deletedAt != null || task.status === "cancelled") continue;
    const key = JSON.stringify([task.eventId, task.eventDishId || task._id]);
    const tally = totals.get(key) ?? { total: 0, completed: 0 };
    tally.total++;
    if (task.status === "completed") tally.completed++;
    totals.set(key, tally);
  }
  return (
    <div className="my-day-prep-dishes">
      {[...groups].map(([key, rows]) => {
        const first = rows[0];
        const entry = entriesById.get(first.eventDishId);
        const dish = dishesById.get(entry?.dishId ?? first.dishId ?? "");
        const event = eventsById.get(first.eventId);
        const tally = totals.get(key) ?? { total: rows.length, completed: 0 };
        return (
          <section
            className="my-day-prep-dish"
            key={key}
            aria-labelledby={`prep-dish-${first._id}`}
          >
            <header className="my-day-prep-dish-heading">
              <div>
                <p className="my-day-prep-event">
                  {event?.title ??
                    (events ? "Event unavailable" : "Loading event...")}
                </p>
                <h3 id={`prep-dish-${first._id}`}>
                  {dish?.name ??
                    (dishes && eventDishes
                      ? "Dish unavailable"
                      : "Loading dish...")}
                </h3>
                <p className="my-day-prep-dish-meta">
                  {entry
                    ? `${entry.quantityServings} servings`
                    : eventDishes
                      ? "Servings unavailable"
                      : "Loading servings…"}
                  {entry?.course ? `  |  ${entry.course}` : ""}
                </p>
              </div>
              <div className="my-day-prep-progress">
                <span>
                  {tally.completed}/{tally.total} tasks complete
                </span>
                <progress
                  value={tally.completed}
                  max={tally.total}
                  aria-label={`${dish?.name ?? "Dish"} preparation complete`}
                />
              </div>
            </header>
            <ul className="my-day-prep-rows">
              {rows.map((task) => {
                const key = `task:${task._id}`;
                const dependency = prepTaskDependencySummary(
                  task._id,
                  known,
                  dependencies ?? [],
                );
                const waiting =
                  task.status === "claimed" && dependency.isBlocked;
                const made = prepMadeSoFarLabel(task, known);
                const stepsDishId = task.componentId
                  ? null
                  : (entry?.dishId ?? task.dishId ?? null);
                const title = task.name?.trim() || "Prep task";
                // Claim and Start stay one tap away; Done is the checkbox.
                const next =
                  task.status === "pending"
                    ? { label: "Claim", command: "task-claim" }
                    : task.status === "claimed"
                      ? { label: "Start", command: "task-start" }
                      : null;
                const secondary =
                  next != null ||
                  task.status === "claimed" ||
                  Boolean(task.specialInstructions) ||
                  dependency.total > 0 ||
                  Boolean(task.componentId) ||
                  Boolean(stepsDishId);
                return (
                  <PrepTaskRow
                    key={task._id}
                    name={title}
                    quantity={task.quantity}
                    unit={task.unit}
                    context={
                      [dish?.name, made].filter(Boolean).join(" · ") || null
                    }
                    station={task.station}
                    dueAt={task.dueAt}
                    status={task.status}
                    blockReason={task.blockReason}
                    now={now}
                    working={busy === `${key}:complete`}
                    locked={busy != null}
                    queued={queuedCompleteIds.has(task._id)}
                    onComplete={() =>
                      perform(`${key}:complete`, "task-complete", "Done", {
                        docId: task._id,
                        version: task.version,
                      })
                    }
                  >
                    {secondary ? (
                      <>
                        {dependency.total > 0 && (
                          <p
                            id={`my-day-prep-dependencies-${task._id}`}
                            className="my-day-prep-note w-full"
                          >
                            {prepTaskDependencyLabel(dependency)}
                          </p>
                        )}
                        {task.specialInstructions && (
                          <p className="my-day-prep-note w-full">
                            {task.specialInstructions}
                          </p>
                        )}
                        {next && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm my-day-prep-action"
                            disabled={busy != null || waiting}
                            aria-describedby={
                              dependency.total > 0
                                ? `my-day-prep-dependencies-${task._id}`
                                : undefined
                            }
                            aria-label={`${next.label}: ${title}`}
                            onClick={() =>
                              perform(key, next.command, next.label, {
                                docId: task._id,
                                version: task.version,
                              })
                            }
                          >
                            {busy === key ? "Working..." : next.label}
                          </button>
                        )}
                        {task.status === "claimed" && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm my-day-prep-action"
                            disabled={busy != null}
                            aria-label={`Release: ${title}`}
                            onClick={() =>
                              perform(
                                `${key}:release`,
                                "task-release",
                                "Release task",
                                { docId: task._id, version: task.version },
                              )
                            }
                          >
                            Release
                          </button>
                        )}
                        {task.componentId ? (
                          <CulinaryEntityLink
                            kind="component"
                            id={task.componentId}
                            prepTaskId={task._id}
                            className="inline-flex min-h-11 items-center text-base text-accent underline underline-offset-2"
                          >
                            Recipe: {title}
                          </CulinaryEntityLink>
                        ) : stepsDishId ? (
                          <CulinaryEntityLink
                            kind="dish"
                            id={stepsDishId}
                            className="inline-flex min-h-11 items-center text-base text-accent underline underline-offset-2"
                          >
                            Steps for {dish?.name ?? "this dish"}
                          </CulinaryEntityLink>
                        ) : null}
                      </>
                    ) : null}
                  </PrepTaskRow>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
