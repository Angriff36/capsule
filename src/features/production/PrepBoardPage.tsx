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

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
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
    void run("create-task", async () => {
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
    });
  };

  const invokePrepAction = (task: any, key: string) => {
    void run(`${task._id}:${key}`, async () => {
      const args = { docId: task._id, version: task.version };
      if (key === "claim") await claim(args);
      if (key === "release") await release(args);
      if (key === "start") await start(args);
      if (key === "complete") await complete(args);
      if (key === "unblock") await unblock(args);
      if (key === "markBlocked") {
        const reason = window.prompt("Block reason")?.trim();
        if (!reason) return;
        await markBlocked({ ...args, reason });
      }
      if (key === "cancel") {
        const reason = window.prompt("Cancel reason")?.trim();
        if (!reason) return;
        await cancel({ ...args, reason });
      }
    });
  };

  const openCheck = (taskId: string) => {
    void run(`${taskId}:open-check`, async () => {
      await createCheck({ prepTaskId: taskId });
    });
  };

  const invokeQualityAction = (check: any, key: string) => {
    void run(`${check._id}:${key}`, async () => {
      const args = { docId: check._id, version: check.version };
      if (key === "pass") await passCheck(args);
      if (key === "fail") await failCheck(args);
      if (key === "reinspect") await reinspectCheck(args);
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Kitchen · Production</p>
          <h1 className="display-title mt-2">Prep execution board</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Claim, start, and complete prep work. Open quality checks beside the
            task they gate; a failed check blocks the linked prep task.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Close form" : "Open prep task"}
        </button>
      </header>
      <KitchenBookNav />
      <ProductionWorkspaceNav />

      <aside className="supply-degraded" role="note">
        <strong>Quality blocks prep</strong>
        <span>
          Failing a pending quality check runs the governed PrepTask block path.
          Lead capability is required for that consequence to complete.
        </span>
      </aside>
      {failure ? <ProductionFailureBanner error={failure} /> : null}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitTask}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New governed prep work</p>
              <h2>Open prep task</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-task" ? "Opening…" : "Open"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event
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
              Ingredient
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
              Station
              <input name="station" className="input" placeholder="garde" />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Execution</p>
            <h2>Prep tasks</h2>
          </div>
          <span>{activeTasks.length} open lines</span>
        </div>
        {tasks === undefined ||
        events === undefined ||
        ingredients === undefined ||
        checks === undefined ? (
          <TableSkeleton rows={7} />
        ) : activeTasks.length === 0 ? (
          <div className="document-empty">
            <p>No prep tasks are open.</p>
            <span>Open work against an event and an active ingredient.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Ingredient</th>
                  <th>Qty</th>
                  <th>Station</th>
                  <th>State</th>
                  <th>Quality</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeTasks.map((task) => {
                  const actions = policy.prepActions(String(task.status));
                  const linked = checksForTask(task._id);
                  return (
                    <tr key={task._id}>
                      <td>
                        <strong>{eventName(task.eventId)}</strong>
                        <small>{task.eventId.slice(-8)}</small>
                      </td>
                      <td>{ingredientName(task.ingredientId)}</td>
                      <td className="supply-number">
                        {task.quantity} {task.unit}
                      </td>
                      <td>{task.station || "—"}</td>
                      <td>
                        <StatusChip status={String(task.status)} />
                        {task.blockReason ? (
                          <small>{task.blockReason}</small>
                        ) : null}
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          {linked.length === 0 ? (
                            <button
                              className="text-link"
                              disabled={busy != null}
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
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy != null}
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
                        <div className="supply-row-actions">
                          {actions.map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
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
      </section>
    </div>
  );
}
