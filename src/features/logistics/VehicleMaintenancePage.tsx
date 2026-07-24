import { useMemo, useState, type FormEvent } from "react";
import { formatDate } from "../../lib/format";
import {
  useCreateVehicleFuelLog,
  useCreateVehicleMaintenanceSchedule,
  useCreateVehicleServiceEntry,
  useListVehicle,
  useListVehicleFuelLog,
  useListVehicleMaintenanceSchedule,
  useListVehicleServiceEntry,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS_MS = 7 * DAY_MS;
const SOON_MILES = 500;
const costFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const milesFmt = new Intl.NumberFormat("en-US");

type IntervalType = "time" | "mileage";

type VehicleRow = {
  _id: string;
  make: string;
  model: string;
  registration: string;
  operationalStatus: string;
  deletedAt?: number | null;
};

type ScheduleRow = {
  _id: string;
  vehicleId: string;
  taskName: string;
  intervalType: IntervalType;
  intervalDays: number;
  intervalMiles: number;
  nextDueAt?: number | null;
  nextDueMileage?: number | null;
  instructions?: string | null;
  scheduledAt?: number | null;
  deletedAt?: number | null;
};

type ServiceRow = {
  _id: string;
  maintenanceScheduleId: string;
  vehicleId: string;
  vendor: string;
  cost: number;
  odometer: number;
  completedAt?: number | null;
  notes?: string | null;
  loggedAt?: number | null;
  deletedAt?: number | null;
};

type FuelRow = {
  _id: string;
  vehicleId: string;
  odometer: number;
  fuelCost: number;
  filledAt?: number | null;
  notes?: string | null;
  loggedAt?: number | null;
  deletedAt?: number | null;
};

type DueState = "overdue" | "soon" | "scheduled";

function localDateTime(value: number): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(value - offset).toISOString().slice(0, 16);
}

export function VehicleMaintenancePage() {
  const vehicles = useListVehicle() as VehicleRow[] | undefined;
  const schedules = useListVehicleMaintenanceSchedule() as
    ScheduleRow[] | undefined;
  const services = useListVehicleServiceEntry() as ServiceRow[] | undefined;
  const fuelLogs = useListVehicleFuelLog() as FuelRow[] | undefined;
  const createSchedule = useCreateVehicleMaintenanceSchedule();
  const createService = useCreateVehicleServiceEntry();
  const createFuel = useCreateVehicleFuelLog();

  const [panel, setPanel] = useState<"none" | "schedule" | "fuel">("none");
  const [intervalType, setIntervalType] = useState<IntervalType>("time");
  const [serviceScheduleId, setServiceScheduleId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = Date.now();

  const fleet = (vehicles ?? []).filter(
    (vehicle) =>
      vehicle.deletedAt == null && vehicle.operationalStatus !== "retired",
  );
  const vehicleById = useMemo(
    () => new Map(fleet.map((vehicle) => [String(vehicle._id), vehicle])),
    [fleet],
  );

  const activeSchedules = (schedules ?? [])
    .filter((row) => row.deletedAt == null && row.scheduledAt != null)
    .sort(
      (left, right) => Number(left.scheduledAt) - Number(right.scheduledAt),
    );
  const serviceEntries = (services ?? [])
    .filter((row) => row.deletedAt == null && row.loggedAt != null)
    .sort(
      (left, right) =>
        Number(right.completedAt ?? 0) - Number(left.completedAt ?? 0),
    );
  const fuelEntries = (fuelLogs ?? [])
    .filter((row) => row.deletedAt == null && row.loggedAt != null)
    .sort(
      (left, right) => Number(right.filledAt ?? 0) - Number(left.filledAt ?? 0),
    );

  // Current odometer per vehicle = latest reading across fuel + service logs.
  const odometerByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of serviceEntries) {
      const id = String(row.vehicleId);
      map.set(id, Math.max(map.get(id) ?? 0, row.odometer));
    }
    for (const row of fuelEntries) {
      const id = String(row.vehicleId);
      map.set(id, Math.max(map.get(id) ?? 0, row.odometer));
    }
    return map;
  }, [serviceEntries, fuelEntries]);

  const dueState = (schedule: ScheduleRow): DueState => {
    if (schedule.intervalType === "mileage") {
      const current = odometerByVehicle.get(String(schedule.vehicleId)) ?? 0;
      if (schedule.nextDueMileage == null) return "scheduled";
      const remaining = schedule.nextDueMileage - current;
      if (remaining <= 0) return "overdue";
      if (remaining <= SOON_MILES) return "soon";
      return "scheduled";
    }
    if (schedule.nextDueAt == null) return "scheduled";
    if (schedule.nextDueAt < now) return "overdue";
    if (schedule.nextDueAt <= now + SOON_DAYS_MS) return "soon";
    return "scheduled";
  };

  const dueLabel = (schedule: ScheduleRow): string => {
    if (schedule.intervalType === "mileage") {
      const current = odometerByVehicle.get(String(schedule.vehicleId)) ?? 0;
      if (schedule.nextDueMileage == null) return "Set due mileage";
      const remaining = schedule.nextDueMileage - current;
      if (remaining <= 0) return `${milesFmt.format(-remaining)} mi overdue`;
      return `${milesFmt.format(remaining)} mi left`;
    }
    if (schedule.nextDueAt == null) return "Set due date";
    const days = Math.max(
      1,
      Math.ceil(Math.abs(schedule.nextDueAt - now) / DAY_MS),
    );
    return schedule.nextDueAt < now ? `${days}d overdue` : `Due in ${days}d`;
  };

  const withDue = activeSchedules
    .map((schedule) => ({ schedule, state: dueState(schedule) }))
    .sort((left, right) => {
      const rank = { overdue: 0, soon: 1, scheduled: 2 } as const;
      return rank[left.state] - rank[right.state];
    });
  const overdueCount = withDue.filter((row) => row.state === "overdue").length;
  const dueSoonCount = withDue.filter((row) => row.state === "soon").length;
  const serviceSchedule = activeSchedules.find(
    (row) => String(row._id) === serviceScheduleId,
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = String(data.get("intervalType")) as IntervalType;
    void run("schedule", async () => {
      await createSchedule({
        vehicleId: String(data.get("vehicleId")),
        taskName: String(data.get("taskName") ?? "").trim(),
        intervalType: type,
        intervalDays:
          type === "time" ? Number(data.get("intervalDays")) : undefined,
        intervalMiles:
          type === "mileage" ? Number(data.get("intervalMiles")) : undefined,
        nextDueAt:
          type === "time"
            ? new Date(String(data.get("nextDueAt"))).getTime()
            : undefined,
        nextDueMileage:
          type === "mileage" ? Number(data.get("nextDueMileage")) : undefined,
        instructions:
          String(data.get("instructions") ?? "").trim() || undefined,
      });
      form.reset();
      setPanel("none");
      setNotice("Maintenance schedule added to the service board.");
    });
  };

  const submitService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceSchedule) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const completedAt = new Date(String(data.get("completedAt"))).getTime();
    const odometer = Number(data.get("odometer"));
    const nextDueAt =
      serviceSchedule.intervalType === "time"
        ? completedAt + Number(serviceSchedule.intervalDays) * DAY_MS
        : undefined;
    const nextDueMileage =
      serviceSchedule.intervalType === "mileage"
        ? odometer + Number(serviceSchedule.intervalMiles)
        : undefined;
    const vehicle = vehicleById.get(String(serviceSchedule.vehicleId));
    void run("service", async () => {
      await createService({
        maintenanceScheduleId: String(serviceSchedule._id),
        vehicleId: String(serviceSchedule.vehicleId),
        vendor: String(data.get("vendor") ?? "").trim(),
        cost: Number(data.get("cost")),
        odometer,
        completedAt,
        nextDueAt,
        nextDueMileage,
        notes: String(data.get("notes") ?? "").trim() || undefined,
      });
      form.reset();
      setServiceScheduleId(null);
      const dueText =
        serviceSchedule.intervalType === "mileage"
          ? `${milesFmt.format(nextDueMileage ?? 0)} mi`
          : formatDate(nextDueAt);
      setNotice(
        `${vehicle?.registration ?? "Vehicle"} service recorded. Next due ${dueText}.`,
      );
    });
  };

  const submitFuel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("fuel", async () => {
      await createFuel({
        vehicleId: String(data.get("vehicleId")),
        odometer: Number(data.get("odometer")),
        fuelCost: Number(data.get("fuelCost")),
        filledAt: new Date(String(data.get("filledAt"))).getTime(),
        notes: String(data.get("notes") ?? "").trim() || undefined,
      });
      form.reset();
      setPanel("none");
      setNotice("Fuel and mileage recorded.");
    });
  };

  const loading =
    vehicles === undefined ||
    schedules === undefined ||
    services === undefined ||
    fuelLogs === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Maintenance</p>
          <h1 className="display-title mt-2">Vehicle maintenance log</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Record mileage, fuel costs, and service events per vehicle. Set
            time- or mileage-based service intervals and keep compliance records
            current with due alerts.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setPanel(panel === "fuel" ? "none" : "fuel")}
          >
            {panel === "fuel" ? "Close fuel log" : "Log fuel"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setPanel(panel === "schedule" ? "none" : "schedule")}
          >
            {panel === "schedule" ? "Close scheduler" : "Schedule maintenance"}
          </button>
        </div>
      </header>

      <LogisticsWorkspaceNav />

      <div
        className="mt-3 flex gap-4 text-[13px] text-ink-2"
        aria-label="Maintenance totals"
      >
        <span data-testid="maintenance-overdue-count">
          <b>{overdueCount}</b> overdue
        </span>
        <span>
          <b>{dueSoonCount}</b> due soon
        </span>
        <span>
          <b>{serviceEntries.length}</b> services logged
        </span>
      </div>

      {overdueCount > 0 ? (
        <div
          className="mt-3 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger"
          role="alert"
          data-testid="maintenance-overdue-alert"
        >
          <strong>
            {overdueCount} vehicle{overdueCount === 1 ? "" : "s"} overdue for
            service
          </strong>{" "}
          — schedule the work before the next dispatch to keep compliance
          records current.
        </div>
      ) : null}
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {panel === "schedule" ? (
        <form
          className="supply-form"
          onSubmit={submitSchedule}
          data-testid="maintenance-schedule-form"
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Recurring work order</p>
              <h2>Schedule maintenance</h2>
            </div>
            <div className="supply-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPanel("none")}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy != null}>
                {busy === "schedule" ? "Scheduling…" : "Add schedule"}
              </button>
            </div>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Vehicle
              <select name="vehicleId" className="input" required autoFocus>
                <option value="">Choose a vehicle</option>
                {fleet.map((vehicle) => (
                  <option key={vehicle._id} value={vehicle._id}>
                    {vehicle.registration} · {vehicle.make} {vehicle.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Maintenance task
              <input
                name="taskName"
                className="input"
                placeholder="Oil change"
                required
              />
            </label>
            <label className="field-label">
              Interval type
              <select
                name="intervalType"
                className="input"
                value={intervalType}
                onChange={(event) =>
                  setIntervalType(event.currentTarget.value as IntervalType)
                }
              >
                <option value="time">Time (days)</option>
                <option value="mileage">Mileage (miles)</option>
              </select>
            </label>
            {intervalType === "time" ? (
              <>
                <label className="field-label">
                  Repeat every (days)
                  <input
                    key="intervalDays"
                    name="intervalDays"
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={90}
                    required
                  />
                </label>
                <label className="field-label">
                  First due
                  <input
                    name="nextDueAt"
                    className="input"
                    type="datetime-local"
                    defaultValue={localDateTime(now + 90 * DAY_MS)}
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field-label">
                  Repeat every (miles)
                  <input
                    key="intervalMiles"
                    name="intervalMiles"
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={5000}
                    required
                  />
                </label>
                <label className="field-label">
                  Due at odometer (miles)
                  <input
                    name="nextDueMileage"
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 45000"
                    required
                  />
                </label>
              </>
            )}
            <label className="field-label">
              Instructions
              <input
                name="instructions"
                className="input"
                placeholder="Optional procedure or notes"
              />
            </label>
          </div>
        </form>
      ) : null}

      {panel === "fuel" ? (
        <form
          className="supply-form"
          onSubmit={submitFuel}
          data-testid="fuel-log-form"
        >
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Fuel & mileage</p>
              <h2>Log fuel</h2>
            </div>
            <div className="supply-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPanel("none")}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy != null}>
                {busy === "fuel" ? "Saving…" : "Record fill-up"}
              </button>
            </div>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Vehicle
              <select name="vehicleId" className="input" required autoFocus>
                <option value="">Choose a vehicle</option>
                {fleet.map((vehicle) => (
                  <option key={vehicle._id} value={vehicle._id}>
                    {vehicle.registration} · {vehicle.make} {vehicle.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Odometer (miles)
              <input
                name="odometer"
                className="input"
                type="number"
                min={0}
                step={1}
                required
              />
            </label>
            <label className="field-label">
              Fuel cost
              <input
                name="fuelCost"
                className="input"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                required
              />
            </label>
            <label className="field-label">
              Filled
              <input
                name="filledAt"
                className="input"
                type="datetime-local"
                max={localDateTime(now)}
                defaultValue={localDateTime(now)}
                required
              />
            </label>
            <label className="field-label">
              Notes
              <input
                name="notes"
                className="input"
                placeholder="Optional station or fill note"
              />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Service board</p>
            <h2>Maintenance schedules</h2>
          </div>
          <span>{activeSchedules.length} scheduled</span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : activeSchedules.length === 0 ? (
          <div className="document-empty">
            <p>No maintenance schedules yet.</p>
            <span>
              {fleet.length === 0
                ? "Register a vehicle in the Fleet tab, then set its service intervals here."
                : "Schedule the first service interval to start tracking compliance."}
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Task</th>
                  <th>Interval</th>
                  <th>Next due</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {withDue.map(({ schedule, state }) => {
                  const vehicle = vehicleById.get(String(schedule.vehicleId));
                  const isOpen = serviceScheduleId === String(schedule._id);
                  const current =
                    odometerByVehicle.get(String(schedule.vehicleId)) ?? 0;
                  return (
                    <tr
                      key={schedule._id}
                      data-testid="maintenance-schedule-row"
                    >
                      <td>
                        <strong>{vehicle?.registration ?? "Unknown"}</strong>
                        {vehicle ? (
                          <small>
                            {vehicle.make} {vehicle.model}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <strong>{schedule.taskName}</strong>
                        {schedule.instructions ? (
                          <small>{schedule.instructions}</small>
                        ) : null}
                      </td>
                      <td>
                        {schedule.intervalType === "mileage"
                          ? `Every ${milesFmt.format(schedule.intervalMiles)} mi`
                          : `Every ${schedule.intervalDays} days`}
                      </td>
                      <td>
                        {schedule.intervalType === "mileage" ? (
                          <>
                            <strong>
                              {schedule.nextDueMileage != null
                                ? `${milesFmt.format(schedule.nextDueMileage)} mi`
                                : "—"}
                            </strong>
                            <small>at {milesFmt.format(current)} mi now</small>
                          </>
                        ) : (
                          <strong>{formatDate(schedule.nextDueAt)}</strong>
                        )}
                      </td>
                      <td>
                        <StatusChip status={state} />
                        <small data-testid="maintenance-due-label">
                          {dueLabel(schedule)}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            setServiceScheduleId(
                              isOpen ? null : String(schedule._id),
                            )
                          }
                          data-testid="log-service-button"
                        >
                          {isOpen ? "Close" : "Log service"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {serviceSchedule ? (
          <form
            className="supply-form mt-4"
            onSubmit={submitService}
            data-testid="service-log-form"
          >
            <div className="supply-form-heading">
              <div>
                <p className="eyebrow">Completion record</p>
                <h2>Log service · {serviceSchedule.taskName}</h2>
              </div>
              <div className="supply-row-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setServiceScheduleId(null)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy != null}>
                  {busy === "service" ? "Recording…" : "Complete service"}
                </button>
              </div>
            </div>
            <div className="supply-form-grid">
              <label className="field-label">
                Vendor / technician
                <input name="vendor" className="input" required autoFocus />
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
              <label className="field-label">
                Odometer (miles)
                <input
                  name="odometer"
                  className="input"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={
                    odometerByVehicle.get(String(serviceSchedule.vehicleId)) ??
                    0
                  }
                  required
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
                Notes
                <input
                  name="notes"
                  className="input"
                  placeholder="Parts, readings, follow-up…"
                />
              </label>
            </div>
          </form>
        ) : null}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Recent fuel & service</h2>
          </div>
          <span>
            {fuelEntries.length} fuel · {serviceEntries.length} service
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={3} />
        ) : fuelEntries.length === 0 && serviceEntries.length === 0 ? (
          <div className="document-empty">
            <p>No fuel or service records yet.</p>
            <span>
              Log a fill-up or service to build the compliance history.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th className="supply-number">Odometer</th>
                  <th className="supply-number">Cost</th>
                </tr>
              </thead>
              <tbody>
                {mergeHistory(fuelEntries, serviceEntries).map((row) => {
                  const vehicle = vehicleById.get(String(row.vehicleId));
                  return (
                    <tr key={`${row.kind}:${row.id}`}>
                      <td>{formatDate(row.at)}</td>
                      <td>{vehicle?.registration ?? "—"}</td>
                      <td>
                        <StatusChip
                          status={row.kind === "fuel" ? "fuel" : "service"}
                        />
                      </td>
                      <td>{row.detail}</td>
                      <td className="supply-number">
                        {milesFmt.format(row.odometer)} mi
                      </td>
                      <td className="supply-number">
                        {costFmt.format(row.cost)}
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

function mergeHistory(fuel: FuelRow[], service: ServiceRow[]) {
  const rows = [
    ...fuel.map((row) => ({
      kind: "fuel" as const,
      id: String(row._id),
      vehicleId: String(row.vehicleId),
      at: Number(row.filledAt ?? row.loggedAt ?? 0),
      odometer: row.odometer,
      cost: row.fuelCost,
      detail: row.notes ?? "Fill-up",
    })),
    ...service.map((row) => ({
      kind: "service" as const,
      id: String(row._id),
      vehicleId: String(row.vehicleId),
      at: Number(row.completedAt ?? row.loggedAt ?? 0),
      odometer: row.odometer,
      cost: row.cost,
      detail: row.vendor,
    })),
  ];
  return rows.sort((left, right) => right.at - left.at).slice(0, 30);
}
