import { useMemo } from "react";
import {
  useListTask,
  useTaskComplete,
  useTaskStart,
} from "../../lib/manifest-convex-react";
import type { Id } from "../../lib/api";

type TaskRow = {
  _id: Id<"tasks">;
  tenantId: string;
  deletedAt?: number | null;
  assignedToId: Id<"people">;
  createdById: Id<"people">;
  title: string;
  description?: string | null;
  dueAt: number;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  completedAt?: number | null;
  cancelledAt?: number | null;
  version?: number;
};

type Props = {
  /** The signed-in Person; only rows assigned to them appear. */
  readonly personId: Id<"people">;
};

/**
 * Compact list of the signed-in Person's open + recently-completed
 * tasks. Lives on My Day next to the prep list. Grouped by overdue →
 * due today → later → done (this week). Mark-done writes through the
 * generated `useTaskComplete` hook; start-warm writes through
 * `useTaskStart`. Leadership uses the admin page for full assignment
 * workflows; this surface is read-mostly with two write actions.
 */
export function MyDayTasksCard({ personId }: Props) {
  const allTasks = (useListTask() ?? []) as TaskRow[];
  const complete = useTaskComplete();
  const start = useTaskStart();

  const grouped = useMemo(() => groupTasks(allTasks, personId), [allTasks, personId]);

  if (
    grouped.overdue.length === 0 &&
    grouped.today.length === 0 &&
    grouped.later.length === 0 &&
    grouped.doneRecently.length === 0
  ) {
    return (
      <section className="my-day-tasks-card" aria-label="My tasks">
        <h3>My tasks</h3>
        <p className="text-base text-ink-2">No tasks assigned right now.</p>
      </section>
    );
  }

  return (
    <section className="my-day-tasks-card" aria-label="My tasks">
      <h3>My tasks</h3>
      {grouped.overdue.length > 0 ? (
        <TaskGroup label="Overdue" tone="warn" tasks={grouped.overdue}>
          {(task) => (
            <TaskActions
              task={task}
              onStart={() => start({ docId: task._id, version: task.version ?? 1 })}
              onComplete={() => complete({ docId: task._id, version: task.version ?? 1 })}
            />
          )}
        </TaskGroup>
      ) : null}
      {grouped.today.length > 0 ? (
        <TaskGroup label="Due today" tasks={grouped.today}>
          {(task) => (
            <TaskActions
              task={task}
              onStart={() => start({ docId: task._id, version: task.version ?? 1 })}
              onComplete={() => complete({ docId: task._id, version: task.version ?? 1 })}
            />
          )}
        </TaskGroup>
      ) : null}
      {grouped.later.length > 0 ? (
        <TaskGroup label="Later" tasks={grouped.later}>
          {(task) => (
            <TaskActions
              task={task}
              onStart={() => start({ docId: task._id, version: task.version ?? 1 })}
              onComplete={() => complete({ docId: task._id, version: task.version ?? 1 })}
            />
          )}
        </TaskGroup>
      ) : null}
      {grouped.doneRecently.length > 0 ? (
        <TaskGroup label="Done this week" tasks={grouped.doneRecently}>
          {() => null}
        </TaskGroup>
      ) : null}
    </section>
  );
}

function TaskGroup({
  label,
  tone,
  tasks,
  children,
}: {
  readonly label: string;
  readonly tone?: "warn";
  readonly tasks: readonly TaskRow[];
  readonly children: (task: TaskRow) => React.ReactNode;
}) {
  return (
    <div className={`my-day-tasks-group${tone === "warn" ? " is-warn" : ""}`}>
      <h4>{label}</h4>
      <ul>
        {tasks.map((task) => (
          <li key={task._id}>
            <span className="my-day-tasks-line">
              <strong>{task.title}</strong>
              <small>Due {formatDue(task.dueAt)}</small>
            </span>
            {children(task)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskActions({
  task,
  onStart,
  onComplete,
}: {
  readonly task: TaskRow;
  readonly onStart: () => void;
  readonly onComplete: () => void;
}) {
  if (task.status === "completed") return null;
  return (
    <span className="my-day-tasks-actions">
      {task.status === "pending" ? (
        <button type="button" onClick={onStart}>
          Start
        </button>
      ) : null}
      <button type="button" onClick={onComplete}>
        Mark done
      </button>
    </span>
  );
}

type GroupedTasks = {
  overdue: TaskRow[];
  today: TaskRow[];
  later: TaskRow[];
  doneRecently: TaskRow[];
};

function groupTasks(rows: readonly TaskRow[], personId: Id<"people">): GroupedTasks {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const mine = rows.filter(
    (row) => row.deletedAt == null && row.assignedToId === personId,
  );
  const open = mine.filter(
    (row) => row.status === "pending" || row.status === "in_progress",
  );
  const overdue = open.filter((row) => row.dueAt < startOfToday.getTime());
  const today = open.filter(
    (row) =>
      row.dueAt >= startOfToday.getTime() && row.dueAt < startOfTomorrow.getTime(),
  );
  const later = open.filter((row) => row.dueAt >= startOfTomorrow.getTime());
  const doneRecently = mine
    .filter(
      (row) =>
        row.status === "completed" &&
        row.completedAt != null &&
        row.completedAt >= startOfWeek.getTime(),
    )
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return {
    overdue: sortByDue(overdue),
    today: sortByDue(today),
    later: sortByDue(later),
    doneRecently: doneRecently.slice(0, 5),
  };
}

function sortByDue(rows: TaskRow[]): TaskRow[] {
  return [...rows].sort((a, b) => a.dueAt - b.dueAt);
}

function formatDue(dueAt: number): string {
  return new Date(dueAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
