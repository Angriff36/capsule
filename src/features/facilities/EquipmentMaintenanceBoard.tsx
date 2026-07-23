import { useMemo, useState, type FormEvent } from "react";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateEquipmentMaintenanceTask,
  useCreateEquipmentServiceEntry,
  useListEquipmentMaintenanceTask,
  useListEquipmentServiceEntry,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { SupplyFailureBanner } from "../inventory/SupplyFailureBanner";
import "./EquipmentMaintenanceBoard.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_MS = 7 * DAY_MS;
const serviceCostFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type EquipmentRow = {
  _id: string;
  name: string;
  assetTag: string;
  condition: string;
  status: string;
  registeredAt?: number | null;
  deletedAt?: number | null;
};

export function EquipmentMaintenanceBoard({
  equipment,
}: {
  equipment: EquipmentRow[];
}) {
  const tasks = useListEquipmentMaintenanceTask();
  const serviceEntries = useListEquipmentServiceEntry();
  const createTask = useCreateEquipmentMaintenanceTask();
  const createServiceEntry = useCreateEquipmentServiceEntry();
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [serviceTaskId, setServiceTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"schedule" | "service" | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = Date.now();

  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [String(item._id), item])),
    [equipment],
  );
  const activeEquipment = equipment.filter(
    (item) =>
      item.deletedAt == null &&
      item.status === "active" &&
      item.registeredAt != null,
  );
  const maintenanceTasks = (tasks ?? [])
    .filter((task) => task.deletedAt == null && task.scheduledAt != null)
    .sort(
      (left, right) =>
        Number(left.nextDueAt ?? Number.MAX_SAFE_INTEGER) -
        Number(right.nextDueAt ?? Number.MAX_SAFE_INTEGER),
    );
  const entries = (serviceEntries ?? [])
    .filter((entry) => entry.deletedAt == null && entry.loggedAt != null)
    .sort(
      (left, right) =>
        Number(right.completedAt ?? 0) - Number(left.completedAt ?? 0),
    );
  const entriesByTask = new Map<string, typeof entries>();
  for (const entry of entries) {
    const taskId = String(entry.maintenanceTaskId);
    entriesByTask.set(taskId, [...(entriesByTask.get(taskId) ?? []), entry]);
  }
  const overdueTasks = maintenanceTasks.filter(
    (task) => task.nextDueAt != null && task.nextDueAt < now,
  );
  const dueSoonTasks = maintenanceTasks.filter(
    (task) =>
      task.nextDueAt != null &&
      task.nextDueAt >= now &&
      task.nextDueAt <= now + SOON_MS,
  );
  const serviceTask = maintenanceTasks.find(
    (task) => String(task._id) === serviceTaskId,
  );

  const run = async (
    kind: "schedule" | "service",
    work: () => Promise<void>,
  ) => {
    setFailure(null);
    setNotice(null);
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const scheduleMaintenance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("schedule", async () => {
      await createTask({
        equipmentId: String(data.get("equipmentId")),
        taskName: String(data.get("taskName") ?? "").trim(),
        intervalDays: Number(data.get("intervalDays")),
        nextDueAt: new Date(String(data.get("nextDueAt"))).getTime(),
        instructions:
          String(data.get("instructions") ?? "").trim() || undefined,
      });
      form.reset();
      setShowScheduleForm(false);
      setNotice("Recurring maintenance scheduled and added to the due board.");
    });
  };

  const recordService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceTask) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const completedAt = new Date(String(data.get("completedAt"))).getTime();
    const nextDueAt = completedAt + Number(serviceTask.intervalDays) * DAY_MS;
    const item = equipmentById.get(String(serviceTask.equipmentId));
    void run("service", async () => {
      await createServiceEntry({
        maintenanceTaskId: String(serviceTask._id),
        equipmentId: String(serviceTask.equipmentId),
        technician: String(data.get("technician") ?? "").trim(),
        cost: Number(data.get("cost")),
        completedAt,
        nextDueAt,
        notes: String(data.get("notes") ?? "").trim() || undefined,
      });
      form.reset();
      setServiceTaskId(null);
      setNotice(
        `${item?.name ?? "Equipment"} service recorded. Next due ${formatDate(nextDueAt)}.`,
      );
    });
  };

  return (
    <section
      className="maintenance-board"
      aria-labelledby="maintenance-board-title"
      data-testid="equipment-maintenance-board"
    >
      <header className="maintenance-board__header">
        <div>
          <p className="maintenance-board__kicker">Service control · live</p>
          <h2 id="maintenance-board-title">Maintenance log</h2>
          <p>
            Put every asset on a recurring service rhythm, then log who did the
            work, what it cost, and what they found.
          </p>
        </div>
        <div className="maintenance-board__header-side">
          <div
            className="maintenance-board__metrics"
            aria-label="Maintenance totals"
          >
            <span>
              <b>{overdueTasks.length}</b> overdue
            </span>
            <span>
              <b>{dueSoonTasks.length}</b> due soon
            </span>
            <span>
              <b>{entries.length}</b> services
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowScheduleForm((visible) => !visible)}
          >
            {showScheduleForm ? "Close scheduler" : "Schedule maintenance"}
          </button>
        </div>
      </header>

      {overdueTasks.length > 0 ? (
        <div
          className="maintenance-alert"
          role="alert"
          data-testid="maintenance-overdue-alert"
        >
          <span className="maintenance-alert__signal" aria-hidden="true">
            !
          </span>
          <div>
            <strong>
              {overdueTasks.length} maintenance{" "}
              {overdueTasks.length === 1 ? "task is" : "tasks are"} overdue
            </strong>
            <p>
              Service the flagged equipment or mark its condition out of service
              before the next dispatch.
            </p>
          </div>
        </div>
      ) : null}
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="maintenance-board__notice" role="status">
          {notice}
        </p>
      ) : null}

      {showScheduleForm ? (
        <form
          className="maintenance-form maintenance-form--schedule"
          onSubmit={scheduleMaintenance}
          data-testid="maintenance-schedule-form"
        >
          <div className="maintenance-form__stamp">
            <span>Recurring work order</span>
            <strong>Set the rhythm</strong>
          </div>
          <label className="field-label maintenance-form__asset">
            Equipment
            <select name="equipmentId" className="input" required autoFocus>
              <option value="">Choose an asset</option>
              {activeEquipment.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name} · {item.assetTag}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Maintenance task
            <input
              name="taskName"
              className="input"
              placeholder="Inspect gas regulator"
              required
            />
          </label>
          <label className="field-label">
            Repeat every
            <span className="maintenance-form__inline-input">
              <input
                name="intervalDays"
                className="input"
                type="number"
                min={1}
                step={1}
                defaultValue={30}
                required
              />
              <em>days</em>
            </span>
          </label>
          <label className="field-label">
            First due
            <input
              name="nextDueAt"
              className="input"
              type="datetime-local"
              defaultValue={localDateTime(now + 30 * DAY_MS)}
              required
            />
          </label>
          <label className="field-label maintenance-form__notes">
            Instructions
            <textarea
              name="instructions"
              className="input"
              rows={2}
              placeholder="Optional procedure, parts, or safety notes"
            />
          </label>
          <button className="btn btn-primary" disabled={busy != null}>
            {busy === "schedule" ? "Scheduling…" : "Add work order"}
          </button>
        </form>
      ) : null}

      {tasks === undefined || serviceEntries === undefined ? (
        <div className="maintenance-board__loading">
          <TableSkeleton rows={4} />
        </div>
      ) : maintenanceTasks.length === 0 ? (
        <div className="maintenance-board__empty">
          <span aria-hidden="true">01</span>
          <div>
            <strong>No recurring maintenance scheduled</strong>
            <p>Add the first work order to start the service ledger.</p>
          </div>
        </div>
      ) : (
        <div className="maintenance-ledger">
          {maintenanceTasks.map((task, index) => {
            const item = equipmentById.get(String(task.equipmentId));
            const taskEntries = entriesByTask.get(String(task._id)) ?? [];
            const latestEntry = taskEntries[0];
            const dueState = maintenanceDueState(task.nextDueAt, now);
            const isServiceOpen = serviceTaskId === String(task._id);
            return (
              <article
                key={task._id}
                className="maintenance-ticket"
                data-due={dueState}
                data-testid="maintenance-task-row"
              >
                <div className="maintenance-ticket__rail">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i aria-hidden="true" />
                </div>
                <div className="maintenance-ticket__asset">
                  <span className="maintenance-ticket__label">Asset</span>
                  <strong>{item?.name ?? "Unknown equipment"}</strong>
                  <small>{item?.assetTag ?? "No asset tag"}</small>
                  {item?.condition === "out_of_service" ? (
                    <span className="maintenance-ticket__lock">
                      Checkout locked · out of service
                    </span>
                  ) : null}
                </div>
                <div className="maintenance-ticket__task">
                  <span className="maintenance-ticket__label">Work order</span>
                  <strong>{task.taskName}</strong>
                  <small>Every {task.intervalDays} days</small>
                  {task.instructions ? <p>{task.instructions}</p> : null}
                </div>
                <div className="maintenance-ticket__due">
                  <span className="maintenance-ticket__label">Next due</span>
                  <strong>{formatDate(task.nextDueAt)}</strong>
                  <small>{formatTime(task.nextDueAt)}</small>
                  <span className="maintenance-ticket__due-chip">
                    {dueStateLabel(dueState, task.nextDueAt, now)}
                  </span>
                </div>
                <div className="maintenance-ticket__last-service">
                  <span className="maintenance-ticket__label">
                    Last service
                  </span>
                  {latestEntry ? (
                    <>
                      <strong>{latestEntry.technician}</strong>
                      <small>
                        {formatDate(latestEntry.completedAt)} ·{" "}
                        {formatServiceCost(latestEntry.cost)}
                      </small>
                      {latestEntry.notes ? <p>{latestEntry.notes}</p> : null}
                    </>
                  ) : (
                    <small>No service logged yet</small>
                  )}
                </div>
                <div className="maintenance-ticket__action">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      setServiceTaskId(isServiceOpen ? null : String(task._id))
                    }
                  >
                    {isServiceOpen ? "Close log" : "Log service"}
                  </button>
                  {taskEntries.length > 1 ? (
                    <small>{taskEntries.length} entries on file</small>
                  ) : null}
                </div>

                {isServiceOpen ? (
                  <form
                    className="maintenance-form maintenance-form--service"
                    onSubmit={recordService}
                    data-testid="maintenance-service-form"
                  >
                    <div className="maintenance-form__stamp">
                      <span>Completion record</span>
                      <strong>{task.taskName}</strong>
                    </div>
                    <label className="field-label">
                      Technician
                      <input
                        name="technician"
                        className="input"
                        required
                        autoFocus
                      />
                    </label>
                    <label className="field-label">
                      Completed
                      <input
                        name="completedAt"
                        className="input"
                        type="datetime-local"
                        max={localDateTime(now)}
                        defaultValue={localDateTime(now)}
                        required
                      />
                    </label>
                    <label className="field-label">
                      Cost
                      <input
                        name="cost"
                        className="input"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={0}
                        required
                      />
                    </label>
                    <label className="field-label maintenance-form__notes">
                      Service notes
                      <textarea
                        name="notes"
                        className="input"
                        rows={2}
                        placeholder="Parts replaced, readings, wear, follow-up…"
                      />
                    </label>
                    <button className="btn btn-primary" disabled={busy != null}>
                      {busy === "service" ? "Recording…" : "Complete service"}
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function maintenanceDueState(
  dueAt: number | null | undefined,
  now: number,
): "overdue" | "soon" | "scheduled" {
  if (dueAt != null && dueAt < now) return "overdue";
  if (dueAt != null && dueAt <= now + SOON_MS) return "soon";
  return "scheduled";
}

function dueStateLabel(
  state: "overdue" | "soon" | "scheduled",
  dueAt: number | null | undefined,
  now: number,
): string {
  if (dueAt == null) return "Date needed";
  const days = Math.max(1, Math.ceil(Math.abs(dueAt - now) / DAY_MS));
  if (state === "overdue") return `${days}d overdue`;
  if (state === "soon") return `Due in ${days}d`;
  return "Scheduled";
}

function localDateTime(value: number): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(value - offset).toISOString().slice(0, 16);
}

function formatServiceCost(value: number | null | undefined): string {
  return value == null ? "—" : serviceCostFormat.format(value);
}
