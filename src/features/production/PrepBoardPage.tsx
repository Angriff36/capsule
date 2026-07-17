import { useState, type FormEvent } from "react";
import {
  useCreatePrepTask,
  useCreateQualityCheck,
  useListEvent,
  useListIngredient,
  useListPrepTask,
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
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { KitchenBookNav } from "../kitchen/KitchenBookNav";
import {
  PrepActionReasonForm,
  type PrepReasonAction,
} from "./PrepActionReasonForm";
import { ProductionFailureBanner } from "./ProductionFailureBanner";
import { ProductionLifecyclePolicy } from "./ProductionLifecyclePolicy";
import { ProductionWorkspaceNav } from "./ProductionWorkspaceNav";

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

interface ReasonRequest {
  action: PrepReasonAction;
  task: any;
}

export function PrepBoardPage() {
  const tasks = useListPrepTask();
  const checks = useListQualityCheck();
  const events = useListEvent();
  const ingredients = useListIngredient();
  const createTask = useCreatePrepTask();
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
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(
    null,
  );

  const activeTasks = (tasks ?? []).filter((task) => task.deletedAt == null);
  const activeChecks = (checks ?? []).filter(
    (check) => check.deletedAt == null,
  );
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const ingredientName = (id: string) =>
    ingredients?.find((ingredient) => ingredient._id === id)?.name ??
    "Unknown ingredient";
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
  const isLoading =
    tasks === undefined ||
    events === undefined ||
    ingredients === undefined ||
    checks === undefined;

  const run = async (
    key: string,
    work: () => Promise<void>,
    successMessage: string,
  ) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      setNotice(successMessage);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      "create-task",
      async () => {
        await createTask({
          eventId: String(data.get("eventId")),
          ingredientId: String(data.get("ingredientId")),
          quantity: Number(data.get("quantity")),
          unit: String(data.get("unit")) as (typeof UNITS)[number],
          station: String(data.get("station") || "") || undefined,
          notes: String(data.get("notes") || "") || undefined,
        });
        form.reset();
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
        <button
          type="button"
          className="btn btn-primary"
          aria-expanded={showCreate}
          aria-controls="prep-task-form"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Close task form" : "Add prep task"}
        </button>
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
              Event / service
              <select name="eventId" className="input" required>
                <option value="">Select event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Prep item / ingredient
              <select name="ingredientId" className="input" required>
                <option value="">Select ingredient</option>
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
              No prep tasks have been opened for active events. Add the first
              line when production is ready.
            </span>
            <button
              type="button"
              className="btn btn-primary mt-4"
              aria-expanded={showCreate}
              aria-controls="prep-task-form"
              onClick={() => setShowCreate(true)}
            >
              Add first prep task
            </button>
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
                  <th scope="col">Finish / station</th>
                  <th scope="col">Event / service</th>
                  <th scope="col">Prep item</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">State</th>
                  <th scope="col">Quality</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedTasks.map((task) => {
                  const actions = policy.prepActions(String(task.status));
                  const linked = checksForTask(task._id);
                  return (
                    <tr key={task._id}>
                      <td>
                        <strong>{task.station || "Unassigned"}</strong>
                      </td>
                      <td>
                        <strong>{eventName(task.eventId)}</strong>
                        <small>{task.eventId.slice(-8)}</small>
                      </td>
                      <td>
                        <strong>{ingredientName(task.ingredientId)}</strong>
                        {task.notes ? <small>{task.notes}</small> : null}
                      </td>
                      <td className="supply-number">
                        {task.quantity} {task.unit}
                      </td>
                      <td>
                        <StatusChip status={String(task.status)} />
                        {task.blockReason ? (
                          <small>{task.blockReason}</small>
                        ) : null}
                      </td>
                      <td>
                        <div
                          className="supply-row-actions"
                          aria-label={`Quality actions for ${ingredientName(task.ingredientId)}`}
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
                                <StatusChip status={String(check.status)} />
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
                        <div
                          className="supply-row-actions"
                          aria-label={`Prep actions for ${ingredientName(task.ingredientId)}`}
                        >
                          {actions.map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              aria-busy={busy === `${task._id}:${action.key}`}
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
              taskName={ingredientName(reasonRequest.task.ingredientId)}
              onCancel={() => setReasonRequest(null)}
              onSubmit={submitReason}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
