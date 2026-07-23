import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePrepTask,
  useCreatePrepTaskDependency,
  useCreateQualityCheck,
  useListDish,
  useListEvent,
  useListEventDish,
  useListIngredient,
  useListPrepTask,
  useListPrepTaskComment,
  useListPrepTaskDependency,
  useListQualityCheck,
  usePrepTaskCancel,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskMarkBlocked,
  usePrepTaskRelease,
  usePrepTaskStart,
  usePrepTaskUnblock,
  useQualityCheckFail,
  useQualityCheckPass,
  useQualityCheckReinspect,
} from "../../lib/manifest-convex-react";
import {
  BulkActionBar,
  useBulkRun,
  useBulkSelection,
} from "../../ui/bulk-select";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { useOptimisticStatus } from "../../ui/useOptimisticStatus";
import { KitchenBookNav } from "../kitchen/KitchenBookNav";
import {
  PrepActionReasonForm,
  type PrepReasonAction,
} from "./PrepActionReasonForm";
import { PrepTaskCommentThread } from "./PrepTaskCommentThread";
import { ProductionFailureBanner } from "./ProductionFailureBanner";
import { ProductionLifecyclePolicy } from "./ProductionLifecyclePolicy";
import { ProductionWorkspaceNav } from "./ProductionWorkspaceNav";
import {
  prepTaskDependencyLabel,
  prepTaskDependencySummary,
} from "./PrepTaskDependencies";
import "./PrepTaskDependencies.css";

const UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
] as const;

const policy = new ProductionLifecyclePolicy();

// Reason-free prep transitions safe to run in bulk.
const BULK_PREP = [
  { key: "claim", label: "Claim", verb: "claimed" },
  { key: "start", label: "Start", verb: "started" },
  { key: "complete", label: "Complete", verb: "completed" },
] as const;

interface ReasonRequest {
  action: PrepReasonAction;
  task: any;
}

export function PrepBoardPage() {
  const tasks = useListPrepTask();
  const dependencies = useListPrepTaskDependency();
  const checks = useListQualityCheck();
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const ingredients = useListIngredient();
  const comments = useListPrepTaskComment();
  const createTask = useCreatePrepTask();
  const createDependency = useCreatePrepTaskDependency();
  const claim = usePrepTaskClaim();
  const release = usePrepTaskRelease();
  const start = usePrepTaskStart();
  const complete = usePrepTaskComplete();
  const markBlocked = usePrepTaskMarkBlocked();
  const unblock = usePrepTaskUnblock();
  const cancel = usePrepTaskCancel();
  const createCheck = useCreateQualityCheck();
  const passCheck = useQualityCheckPass();
  const failCheck = useQualityCheckFail();
  const reinspectCheck = useQualityCheckReinspect();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEventDishId, setSelectedEventDishId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(
    null,
  );
  const [threadTaskId, setThreadTaskId] = useState<string | null>(null);
  const optimistic = useOptimisticStatus();

  const activeTasks = (tasks ?? []).filter((task) => task.deletedAt == null);
  const activeDependencies = dependencies ?? [];
  const activeChecks = (checks ?? []).filter(
    (check) => check.deletedAt == null,
  );
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const dishName = (id: string) =>
    dishes?.find((dish) => dish._id === id)?.name ?? "Unknown dish";
  const eventDishLabel = (eventDishId: string) => {
    const entry = eventDishes?.find((row) => row._id === eventDishId);
    if (!entry) return "Unknown event dish";
    return `${eventName(entry.eventId)} · ${dishName(entry.dishId)}`;
  };
  const taskLabel = (task: { name?: string; ingredientId?: string | null }) =>
    task.name?.trim() ||
    (task.ingredientId
      ? (ingredients?.find((ingredient) => ingredient._id === task.ingredientId)
          ?.name ?? "Prep task")
      : "Prep task");
  const checksForTask = (taskId: string) =>
    activeChecks.filter((check) => check.prepTaskId === taskId);
  const blockedTaskCount = activeTasks.filter(
    (task) => String(task.status) === "blocked",
  ).length;
  const stationCount = new Set(
    activeTasks
      .map((task) => task.station?.trim())
      .filter((station): station is string => Boolean(station)),
  ).size;
  const orderedTasks = [...activeTasks].sort((left, right) => {
    const stationOrder = (left.station || "Unassigned").localeCompare(
      right.station || "Unassigned",
    );
    if (stationOrder !== 0) return stationOrder;
    return eventName(left.eventId).localeCompare(eventName(right.eventId));
  });
  const dependencyForTask = (taskId: string) =>
    prepTaskDependencySummary(taskId, activeTasks, activeDependencies);
  const selectedEventId = eventDishes?.find(
    (row) => row._id === selectedEventDishId,
  )?.eventId;
  const predecessorCandidates = activeTasks.filter(
    (task) =>
      selectedEventId != null &&
      task.eventId === selectedEventId &&
      String(task.status) !== "cancelled",
  );
  const taskBulkKeys = (task: { _id: string; status: unknown }) => {
    const available = new Set(
      policy.prepActions(String(task.status)).map((action) => action.key),
    );
    const dependency = dependencyForTask(task._id);
    return BULK_PREP.filter(
      (action) =>
        available.has(action.key) &&
        (action.key !== "start" || !dependency.isBlocked),
    );
  };
  const selectableTasks = orderedTasks.filter(
    (task) => taskBulkKeys(task).length > 0,
  );
  const selection = useBulkSelection(selectableTasks);
  const bulk = useBulkRun();
  const commentsByTask = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments ?? []) {
      if (comment.deletedAt != null) continue;
      if (!comment.prepTaskId) continue;
      counts.set(
        String(comment.prepTaskId),
        (counts.get(String(comment.prepTaskId)) ?? 0) + 1,
      );
    }
    return counts;
  }, [comments]);
  const threadTask =
    threadTaskId != null
      ? orderedTasks.find((task) => task._id === threadTaskId)
      : undefined;
  const isLoading =
    tasks === undefined ||
    events === undefined ||
    eventDishes === undefined ||
    dishes === undefined ||
    ingredients === undefined ||
    checks === undefined ||
    dependencies === undefined;

  const run = async (
    key: string,
    work: () => Promise<void>,
    successMessage: string,
    optimisticTarget?: { id: string; status?: string },
  ) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    if (optimisticTarget?.status) {
      optimistic.begin(optimisticTarget.id, optimisticTarget.status);
    }
    try {
      await work();
      setNotice(successMessage);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
      if (optimisticTarget) optimistic.end(optimisticTarget.id);
    }
  };

  const runBulkPrep = (action: (typeof BULK_PREP)[number]) => {
    const targets = selection.selected.filter((task) =>
      taskBulkKeys(task).some((entry) => entry.key === action.key),
    );
    if (targets.length === 0) return;
    void run(
      `bulk-${action.key}`,
      () =>
        bulk.runBulk(targets, async (task) => {
          const args = { docId: task._id, version: task.version };
          if (action.key === "claim") await claim(args);
          if (action.key === "start") await start(args);
          if (action.key === "complete") await complete(args);
        }),
      `${targets.length} prep ${targets.length === 1 ? "task" : "tasks"} ${action.verb}.`,
    ).then(() => selection.clear());
  };

  const submitTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      "create-task",
      async () => {
        const eventDishId = String(data.get("eventDishId"));
        const eventDish = eventDishes?.find((row) => row._id === eventDishId);
        if (!eventDish) throw new Error("Select an event dish");
        const created = await createTask({
          eventDishId,
          eventId: eventDish.eventId,
          name: String(data.get("name") ?? "").trim(),
          quantity: Number(data.get("quantity")),
          unit: String(data.get("unit")) as (typeof UNITS)[number],
          ingredientId: String(data.get("ingredientId") || "") || undefined,
          station: String(data.get("station") || "") || undefined,
          notes: String(data.get("notes") || "") || undefined,
        });
        const predecessorTaskIds = data.getAll("predecessorTaskId").map(String);
        for (const predecessorTaskId of predecessorTaskIds) {
          await createDependency({
            dependentTaskId: created.docId,
            predecessorTaskId,
          });
        }
        form.reset();
        setSelectedEventDishId("");
        setShowCreate(false);
      },
      "Prep task opened and added to the production sheet.",
    );
  };

  const invokePrepAction = (task: any, key: string) => {
    if (key === "markBlocked" || key === "cancel") {
      setFailure(null);
      setNotice(null);
      setReasonRequest({ action: key, task });
      return;
    }

    const messages: Record<string, string> = {
      claim: "Prep task claimed.",
      release: "Prep task released back to the team.",
      start: "Prep task started.",
      complete: "Prep task marked complete.",
      unblock: "Prep task unblocked and returned to the active sheet.",
    };
    void run(
      `${task._id}:${key}`,
      async () => {
        const args = { docId: task._id, version: task.version };
        if (key === "claim") await claim(args);
        if (key === "release") await release(args);
        if (key === "start") await start(args);
        if (key === "complete") await complete(args);
        if (key === "unblock") await unblock(args);
      },
      messages[key] ?? "Prep task updated.",
      { id: task._id, status: policy.prepNextStatus(key, String(task.status)) },
    );
  };

  const submitReason = (reason: string) => {
    if (!reasonRequest) return;
    const { action, task } = reasonRequest;
    const args = { docId: task._id, version: task.version, reason };
    void run(
      `${task._id}:${action}`,
      async () => {
        if (action === "markBlocked") await markBlocked(args);
        if (action === "cancel") await cancel(args);
        setReasonRequest(null);
      },
      action === "markBlocked"
        ? "Prep task blocked with a reason for the team."
        : "Prep task cancelled and removed from active production.",
      {
        id: task._id,
        status: policy.prepNextStatus(action, String(task.status)),
      },
    );
  };

  const openCheck = (taskId: string) => {
    void run(
      `${taskId}:open-check`,
      async () => {
        await createCheck({ prepTaskId: taskId });
      },
      "Quality check opened for this prep task.",
    );
  };

  const invokeQualityAction = (check: any, key: string) => {
    const messages: Record<string, string> = {
      pass: "Quality check passed.",
      fail: "Quality check failed and the linked prep task was blocked.",
      reinspect: "Quality check returned for reinspection.",
    };
    void run(
      `${check._id}:${key}`,
      async () => {
        const args = { docId: check._id, version: check.version };
        if (key === "pass") await passCheck(args);
        if (key === "fail") await failCheck(args);
        if (key === "reinspect") await reinspectCheck(args);
      },
      messages[key] ?? "Quality check updated.",
      {
        id: check._id,
        status: policy.qualityNextStatus(key, String(check.status)),
      },
    );
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Kitchen · Service production</p>
          <h1 className="display-title mt-2">Production prep sheet</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Organize event prep by finish station, quantity, instruction, and
            quality gate. Claim a line when you take it, then carry it through
            service-ready completion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/kitchen/display" className="btn btn-ghost">
            Kitchen display
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={showCreate}
            aria-controls="prep-task-form"
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Close task form" : "Add prep task"}
          </button>
        </div>
      </header>
      <KitchenBookNav />
      <ProductionWorkspaceNav />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Prep lines</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {isLoading ? "—" : activeTasks.length}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Finish stations</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {isLoading ? "—" : stationCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Blocked lines</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {isLoading ? "—" : blockedTaskCount}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="eyebrow">Quality checks</dt>
          <dd className="mt-1 text-xl font-semibold text-ink">
            {isLoading ? "—" : activeChecks.length}
          </dd>
        </div>
      </dl>

      <aside className="supply-degraded" role="note">
        <strong>Quality is part of the prep line</strong>
        <span>
          Open a check beside the work it gates. A failed check blocks that prep
          task, and a lead must have permission to complete the quality action.
        </span>
      </aside>
      <div aria-live="polite" aria-atomic="true">
        {notice ? (
          <div className="card border-success/40 px-4 py-3" role="status">
            <p className="font-semibold text-success">Prep board updated</p>
            <p className="mt-1 text-[12px] text-ink-2">{notice}</p>
          </div>
        ) : null}
      </div>
      {failure ? <ProductionFailureBanner error={failure} /> : null}

      {showCreate ? (
        <form
          id="prep-task-form"
          className="supply-form"
          aria-labelledby="prep-task-form-heading"
          onSubmit={submitTask}
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New production line</p>
              <h2 id="prep-task-form-heading">Add prep task</h2>
              <p className="mt-1 text-[12px] text-ink-2">
                Connect the item to its event, quantity, finish location, and
                working instruction.
              </p>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy != null}
              aria-busy={busy === "create-task"}
            >
              {busy === "create-task" ? "Adding…" : "Add to prep sheet"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event dish
              <select
                name="eventDishId"
                className="input"
                required
                value={selectedEventDishId}
                onChange={(event) => setSelectedEventDishId(event.target.value)}
              >
                <option value="">Select event dish</option>
                {(eventDishes ?? [])
                  .filter(
                    (item) => item.deletedAt == null && item.addedAt != null,
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {eventDishLabel(item._id)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Prep task
              <input
                name="name"
                className="input"
                required
                placeholder="e.g. Portion caesar dressing"
              />
            </label>
            <label className="field-label">
              Ingredient (optional)
              <select name="ingredientId" className="input">
                <option value="">None</option>
                {(ingredients ?? [])
                  .filter(
                    (item) =>
                      item.deletedAt == null && item.status === "active",
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Quantity
              <input
                name="quantity"
                className="input"
                type="number"
                min={0.0001}
                step="any"
                required
              />
            </label>
            <label className="field-label">
              Unit
              <select name="unit" className="input">
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Finish / station
              <input
                name="station"
                className="input"
                placeholder="e.g. Passed apps — finish at event"
              />
            </label>
            <label className="field-label">
              Prep instruction / notes
              <input
                name="notes"
                className="input"
                placeholder="e.g. Pipe filling; garnish just before service"
              />
            </label>
            <fieldset className="prep-dependency-picker">
              <legend>Must follow (optional)</legend>
              <p>
                Select earlier work that must be checked off before this task
                can start.
              </p>
              {!selectedEventDishId ? (
                <span>Select an event dish to see its prep tasks.</span>
              ) : predecessorCandidates.length === 0 ? (
                <span>No other prep tasks are available for this event.</span>
              ) : (
                <div className="prep-dependency-options">
                  {predecessorCandidates.map((task) => (
                    <label key={task._id}>
                      <input
                        type="checkbox"
                        name="predecessorTaskId"
                        value={task._id}
                      />
                      <span>
                        <strong>{taskLabel(task)}</strong>
                        <small>
                          {task.station || "Unassigned"} · {String(task.status)}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Event production</p>
            <h2>Prep sheet</h2>
            <p className="mt-1 text-[12px] text-ink-2">
              Finish location leads each line, followed by service, item,
              quantity, and readiness.
            </p>
          </div>
          <span>
            {activeTasks.length}{" "}
            {activeTasks.length === 1 ? "task line" : "task lines"}
          </span>
        </div>
        {isLoading ? (
          <div className="p-4">
            <p className="font-semibold text-ink">
              Loading the production sheet…
            </p>
            <p className="mt-1 text-[12px] text-ink-2">
              Gathering prep lines, event names, ingredients, and quality
              checks.
            </p>
            <div className="mt-3">
              <TableSkeleton rows={7} />
            </div>
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="document-empty">
            <p>The prep sheet is clear</p>
            <span>
              Prep tasks turn an approved event's dishes into kitchen work.
              Approve an event to populate this board, or add the first line by
              hand when production is ready.
            </span>
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Go to events
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={showCreate}
                aria-controls="prep-task-form"
                onClick={() => setShowCreate(true)}
              >
                Add first prep task
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <caption className="sr-only">
                Prep tasks organized by finish station, event, item, quantity,
                status, quality, and available actions.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all prep tasks with bulk actions"
                      checked={selection.allSelected}
                      disabled={busy != null || selectableTasks.length === 0}
                      onChange={(event) =>
                        selection.toggleAll(event.target.checked)
                      }
                    />
                  </th>
                  <th scope="col">Finish / station</th>
                  <th scope="col">Event / service</th>
                  <th scope="col">Prep item</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">State</th>
                  <th scope="col">Quality</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedTasks.map((task) => {
                  const actions = policy.prepActions(String(task.status));
                  const linked = checksForTask(task._id);
                  const dependency = dependencyForTask(task._id);
                  const bulkable = taskBulkKeys(task).length > 0;
                  const taskComments = commentsByTask.get(task._id) ?? 0;
                  return (
                    <tr key={task._id}>
                      <td className="w-8">
                        {bulkable ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${taskLabel(task)}`}
                            checked={selection.isSelected(task._id)}
                            disabled={busy != null}
                            onChange={(event) =>
                              selection.toggle(task._id, event.target.checked)
                            }
                          />
                        ) : null}
                      </td>
                      <td>
                        <strong>{task.station || "Unassigned"}</strong>
                      </td>
                      <td>
                        <strong>{eventName(task.eventId)}</strong>
                        <small>{task.eventId.slice(-8)}</small>
                      </td>
                      <td>
                        <strong>{taskLabel(task)}</strong>
                        <small>{eventDishLabel(task.eventDishId)}</small>
                        {task.notes ? <small>{task.notes}</small> : null}
                      </td>
                      <td className="supply-number">
                        {task.quantity} {task.unit}
                      </td>
                      <td>
                        <StatusChip
                          status={optimistic.statusOf(
                            task._id,
                            String(task.status),
                          )}
                        />
                        {task.blockReason ? (
                          <small>{task.blockReason}</small>
                        ) : null}
                        {dependency.total > 0 ? (
                          <small
                            id={`prep-dependencies-${task._id}`}
                            className={
                              dependency.isBlocked
                                ? "prep-dependency-state is-waiting"
                                : "prep-dependency-state is-ready"
                            }
                          >
                            {prepTaskDependencyLabel(dependency)}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <div
                          className="supply-row-actions"
                          aria-label={`Quality actions for ${taskLabel(task)}`}
                        >
                          {linked.length === 0 ? (
                            <button
                              type="button"
                              className="text-link"
                              disabled={busy != null}
                              aria-busy={busy === `${task._id}:open-check`}
                              onClick={() => openCheck(task._id)}
                            >
                              {busy === `${task._id}:open-check`
                                ? "Opening…"
                                : "Open check"}
                            </button>
                          ) : (
                            linked.map((check) => (
                              <div key={check._id}>
                                <StatusChip
                                  status={optimistic.statusOf(
                                    check._id,
                                    String(check.status),
                                  )}
                                />
                                <div className="supply-row-actions">
                                  {policy
                                    .qualityActions(String(check.status))
                                    .map((action) => (
                                      <button
                                        key={action.key}
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy != null}
                                        aria-busy={
                                          busy === `${check._id}:${action.key}`
                                        }
                                        onClick={() =>
                                          invokeQualityAction(check, action.key)
                                        }
                                      >
                                        {busy === `${check._id}:${action.key}`
                                          ? "Working…"
                                          : action.label}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`chip border-line-2 ${
                            taskComments > 0
                              ? "bg-brand-soft text-brand"
                              : "bg-inset text-ink-3"
                          }`}
                          aria-label={`${taskComments} note${taskComments === 1 ? "" : "s"} for ${taskLabel(task)} — open thread`}
                          aria-pressed={threadTaskId === task._id}
                          disabled={busy != null}
                          onClick={() =>
                            setThreadTaskId((current) =>
                              current === task._id ? null : task._id,
                            )
                          }
                        >
                          {taskComments > 0
                            ? `${taskComments} note${taskComments === 1 ? "" : "s"}`
                            : "Add note"}
                        </button>
                      </td>
                      <td>
                        <div
                          className="supply-row-actions"
                          aria-label={`Prep actions for ${taskLabel(task)}`}
                        >
                          {actions.map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={
                                busy != null ||
                                (action.key === "start" && dependency.isBlocked)
                              }
                              aria-busy={busy === `${task._id}:${action.key}`}
                              aria-describedby={
                                action.key === "start" && dependency.total > 0
                                  ? `prep-dependencies-${task._id}`
                                  : undefined
                              }
                              title={
                                action.key === "start" && dependency.isBlocked
                                  ? prepTaskDependencyLabel(dependency)
                                  : undefined
                              }
                              aria-expanded={
                                action.key === "markBlocked" ||
                                action.key === "cancel"
                                  ? reasonRequest?.task._id === task._id &&
                                    reasonRequest.action === action.key
                                  : undefined
                              }
                              aria-controls={
                                action.key === "markBlocked" ||
                                action.key === "cancel"
                                  ? `prep-reason-${task._id}`
                                  : undefined
                              }
                              onClick={() => invokePrepAction(task, action.key)}
                            >
                              {busy === `${task._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {reasonRequest ? (
          <div id={`prep-reason-${reasonRequest.task._id}`}>
            <PrepActionReasonForm
              action={reasonRequest.action}
              busy={
                busy === `${reasonRequest.task._id}:${reasonRequest.action}`
              }
              taskName={taskLabel(reasonRequest.task)}
              onCancel={() => setReasonRequest(null)}
              onSubmit={submitReason}
            />
          </div>
        ) : null}
      </section>

      {threadTask ? (
        <section
          className="working-ledger mt-6"
          aria-label={`Thread for ${taskLabel(threadTask)}`}
          data-testid="prep-thread-panel"
        >
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Prep thread</p>
              <h2>{taskLabel(threadTask)}</h2>
              <p className="mt-1 text-[12px] text-ink-2">
                {eventName(threadTask.eventId)} ·{" "}
                {threadTask.station || "Unassigned"} ·{" "}
                {String(threadTask.status)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setThreadTaskId(null)}
            >
              Close thread
            </button>
          </div>
          <div className="p-4">
            <PrepTaskCommentThread task={threadTask} />
          </div>
        </section>
      ) : null}

      <BulkActionBar
        count={selection.count}
        noun="prep task"
        progress={bulk.progress}
        onClear={selection.clear}
      >
        {BULK_PREP.map((action) => {
          const applicable = selection.selected.filter((task) =>
            taskBulkKeys(task).some((entry) => entry.key === action.key),
          ).length;
          return (
            <button
              key={action.key}
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy != null || applicable === 0}
              onClick={() => runBulkPrep(action)}
            >
              {action.label} ({applicable})
            </button>
          );
        })}
      </BulkActionBar>
    </div>
  );
}
