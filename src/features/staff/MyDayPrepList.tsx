import { formatDate, formatTime } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import { prepQuantityLabel } from "../kitchen/prepQuantityLabel";

type PrepTask = {
  _id: string;
  version: number;
  eventDishId: string;
  eventId: string;
  dishId?: string | null;
  name?: string;
  status: string;
  quantity: number;
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
  dishes?: { _id: string; name: string }[];
  eventDishes?: EventDish[];
  events?: { _id: string; title: string }[];
  busy: string | null;
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
  dishes,
  eventDishes,
  events,
  busy,
  perform,
}: Props) {
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
                    : `Dish reference: ${first.eventDishId || "unavailable"}`}
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
                const next =
                  task.status === "pending"
                    ? { label: "Claim", command: "task-claim" }
                    : task.status === "claimed"
                      ? { label: "Start", command: "task-start" }
                      : task.status === "in_progress"
                        ? { label: "Done", command: "task-complete" }
                        : null;
                return (
                  <li className="my-day-prep-row" key={task._id}>
                    <div className="my-day-prep-instruction">
                      <p className="my-day-prep-task-name">
                        {task.name?.trim() || "Prep task"}
                      </p>
                      <p className="my-day-prep-task-meta">
                        <strong>
                          {prepQuantityLabel(task.quantity, task.unit)}{" "}
                          {task.unit}
                        </strong>
                        {task.station ? `  |  ${task.station}` : ""}
                        {task.dueAt != null
                          ? `  |  Due ${formatDate(task.dueAt)} ${formatTime(task.dueAt)}`
                          : "  |  No due time"}
                      </p>
                      {task.specialInstructions && (
                        <p className="my-day-prep-note">
                          {task.specialInstructions}
                        </p>
                      )}
                      {task.status === "blocked" && (
                        <p className="my-day-prep-note">
                          Blocked: {task.blockReason || "See kitchen lead"}
                        </p>
                      )}
                    </div>
                    <div className="my-day-prep-row-actions">
                      <StatusChip status={task.status} />
                      {next && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          aria-label={`${next.label}: ${task.name || "prep task"}`}
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
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          aria-label={`Release: ${task.name || "prep task"}`}
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
