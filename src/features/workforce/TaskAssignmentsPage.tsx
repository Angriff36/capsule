import { useState } from "react";
import {
  useListPerson,
  useListTask,
  useTaskCancel,
  useTaskCreate,
} from "../../lib/manifest-convex-react";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

type TaskRow = {
  _id: string;
  deletedAt?: number | null;
  assignedToId: string;
  title: string;
  description?: string | null;
  dueAt: number;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  version?: number;
};

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const OPEN_STATUSES = new Set(["pending", "in_progress"]);

/** Convert a datetime-local input value to a timestamp (local time). */
const localInputToMs = (value: string) =>
  value ? new Date(value).getTime() : NaN;

const msToLocalInput = (ms: number) => {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Leadership surface for assigning personal tasks (the My Day "My tasks"
 * card). Create assigns a task to one staff member with a due date;
 * cancel pulls it back while it is still open. Employees see and work
 * these from My Day; the clock-out warning counts the ones still open
 * at end of shift.
 */
export function TaskAssignmentsPage() {
  const tasks = useListTask() as TaskRow[] | undefined;
  const people = useListPerson();
  const createTask = useTaskCreate();
  const cancelTask = useTaskCancel();

  const [assigneeId, setAssigneeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAtInput, setDueAtInput] = useState(() =>
    msToLocalInput(Date.now() + 4 * 60 * 60 * 1000),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const assignablePeople = (people ?? []).filter(
    (person) =>
      person.deletedAt == null &&
      (person as { isAssignable?: boolean }).isAssignable !== false,
  );
  const personName = (personId: string) => {
    const person = people?.find((row) => row._id === personId);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Staff member";
  };

  const openTasks = (tasks ?? [])
    .filter((task) => task.deletedAt == null && OPEN_STATUSES.has(task.status))
    .sort((left, right) => left.dueAt - right.dueAt);

  const canSubmit =
    assigneeId !== "" &&
    title.trim().length > 0 &&
    Number.isFinite(localInputToMs(dueAtInput));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await createTask({
        assignedToId: assigneeId,
        title: title.trim(),
        description: description.trim(),
        dueAt: localInputToMs(dueAtInput),
      });
      setNotice(`Assigned "${title.trim()}" to ${personName(assigneeId)}.`);
      setTitle("");
      setDescription("");
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (task: TaskRow) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await cancelTask({ docId: task._id, reason: "Cancelled by leadership" });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Tasks</p>
          <h1 className="display-title mt-2">Task assignments</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Give a staff member something to do. Assigned tasks show up on
            their My Day card, and an open task due today blocks their
            clock-out until it is done or explicitly overridden.
          </p>
        </div>
        <div className="rounded-sm border border-brand/20 bg-brand-soft px-5 py-4 text-center">
          <p className="text-3xl leading-none font-semibold text-brand">
            {tasks === undefined ? "—" : openTasks.length}
          </p>
          <p className="mt-1 text-xs font-medium tracking-wide text-ink-2 uppercase">
            Open tasks
          </p>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Assign something</p>
            <h2>New task</h2>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="task-assignment-form"
        >
          <label className="grid gap-1">
            <span className="field-label">Who</span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="input"
              required
            >
              <option value="" disabled>
                Pick a staff member…
              </option>
              {assignablePeople.map((person) => (
                <option key={person._id} value={person._id}>
                  {personName(person._id)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="field-label">What</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Restock cooler 3"
              className="input"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="field-label">Due</span>
            <input
              type="datetime-local"
              value={dueAtInput}
              onChange={(event) => setDueAtInput(event.target.value)}
              className="input"
              required
            />
          </label>
          <label className="grid gap-1">
            <span className="field-label">Note (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Anything they need to know"
              className="input"
            />
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!canSubmit || busy}
            >
              {busy ? "Working…" : "Assign task"}
            </button>
            {notice ? (
              <span className="ml-3 text-sm text-ok">{notice}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="working-ledger" data-testid="open-task-queue">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Still open</p>
            <h2>Open tasks</h2>
          </div>
          <span className="text-sm text-ink-3">
            Cancelling removes it from their My Day and stops the clock-out block
          </span>
        </div>
        {tasks === undefined || people === undefined ? (
          <TableSkeleton rows={3} columns={4} />
        ) : openTasks.length === 0 ? (
          <EmptyState
            title="No open tasks."
            hint="Assign one above — it lands on the person's My Day card instantly."
          />
        ) : (
          <ul className="divide-y divide-line">
            {openTasks.map((task) => (
              <li
                key={task._id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {task.title}
                  </span>
                  <span className="block truncate text-sm text-ink-2">
                    {personName(task.assignedToId)} · due{" "}
                    {dateTimeFormat.format(task.dueAt)}
                    {task.description ? ` · ${task.description}` : ""}
                  </span>
                </span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <StatusChip status={task.status} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => cancel(task)}
                  >
                    Cancel
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
