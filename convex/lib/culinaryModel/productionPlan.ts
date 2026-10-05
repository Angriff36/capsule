/**
 * Production plan (PL-PRODUCTION-PLAN, AC-455, spec BE-9.6): the kitchen's
 * work by production day, station, recipe and batch, read from the same
 * Event prep tasks and production batches the rest of Capsule uses. Nothing
 * here is stored: there is no second prep database.
 *
 * - Prep tasks for the same recipe step, unit and station on the same day are
 *   pooled into one row. Each Event keeps its own share (task id, amount,
 *   amount made), so pooling never loses whose food it is.
 * - A batch is already pooled work; its Event shares come from its
 *   allocations.
 * - A row carries the make-ahead window from the recipe step when one is set
 *   (days before the Event), and what it waits for: earlier prep tasks, the
 *   step the recipe puts first, and the batch that makes its recipe.
 * - Made amounts come from the real output (task completed amount, batch
 *   counted yield), never from the plan.
 */

export const NO_DAY = "not-scheduled";
export const NO_STATION = "No station set";
const DAY_MS = 86_400_000;

export interface PlanEvent {
  _id: string;
  title?: string | null;
  startsAt?: number | null;
  deletedAt?: number | null;
}

export interface PlanPrepTask {
  _id: string;
  eventId: string;
  name: string;
  dishTaskId?: string | null;
  componentId?: string | null;
  station?: string | null;
  stationId?: string | null;
  quantity: number;
  completedQuantity?: number | null;
  unit: unknown;
  status: unknown;
  dueAt?: number | null;
  deletedAt?: number | null;
}

export interface PlanDishTask {
  _id: string;
  name?: string | null;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
  sequenceAfterDishTaskId?: string | null;
}

export interface PlanBatch {
  _id: string;
  componentId: string;
  eventId?: string | null;
  plannedYield: number;
  actualYield?: number | null;
  surplusQuantity?: number | null;
  yieldUnit: unknown;
  status: unknown;
  productionDate?: number | null;
  deletedAt?: number | null;
}

export interface PlanAllocation {
  _id: string;
  productionBatchId: string;
  eventId?: string | null;
  allocatedQuantity: number;
  isSurplus?: boolean | null;
  status?: unknown;
  deletedAt?: number | null;
}

export interface PlanDependency {
  dependentTaskId: string;
  predecessorTaskId: string;
  requirementReleasedAt?: number | null;
}

export interface PlanNamed {
  _id: string;
  name?: string | null;
  sortOrder?: number | null;
}

export interface MakeAheadWindow {
  minDays: number;
  maxDays: number;
  /** First and last day the work may be made, as day keys. */
  earliestDay: string;
  latestDay: string;
}

export interface PlanEventShare {
  eventId: string;
  eventTitle: string;
  /** The prep task or batch allocation this share is. */
  sourceId: string;
  quantity: number;
  made: number;
  done: boolean;
}

export interface PlanWaitFor {
  label: string;
  done: boolean;
}

export interface PlanWorkRow {
  key: string;
  kind: "prep" | "batch";
  day: string;
  station: string;
  recipe: string;
  step: string;
  unit: string;
  planned: number;
  made: number;
  surplus: number;
  done: boolean;
  batchId: string | null;
  shares: PlanEventShare[];
  makeAhead: MakeAheadWindow | null;
  waitsFor: PlanWaitFor[];
}

export interface PlanStationGroup {
  station: string;
  rows: PlanWorkRow[];
}

export interface PlanDay {
  day: string;
  stations: PlanStationGroup[];
}

export interface ProductionPlanInput {
  events: readonly PlanEvent[];
  prepTasks: readonly PlanPrepTask[];
  dishTasks: readonly PlanDishTask[];
  batches: readonly PlanBatch[];
  allocations: readonly PlanAllocation[];
  dependencies: readonly PlanDependency[];
  stations: readonly PlanNamed[];
  components: readonly PlanNamed[];
}

/** Local calendar day, "YYYY-MM-DD". */
export function planDayKey(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const live = <T extends { deletedAt?: number | null }>(rows: readonly T[]) =>
  rows.filter((row) => row.deletedAt == null);

function makeAheadWindow(
  step: PlanDishTask | undefined,
  eventStart: number | null | undefined,
): MakeAheadWindow | null {
  if (!step || eventStart == null) return null;
  const a = step.leadTimeMinDays ?? step.leadTimeMaxDays;
  const b = step.leadTimeMaxDays ?? step.leadTimeMinDays;
  if (a == null || b == null) return null;
  const minDays = Math.min(a, b);
  const maxDays = Math.max(a, b);
  return {
    minDays,
    maxDays,
    earliestDay: planDayKey(eventStart - maxDays * DAY_MS),
    latestDay: planDayKey(eventStart - minDays * DAY_MS),
  };
}

function addWait(list: PlanWaitFor[], wait: PlanWaitFor) {
  const found = list.find((entry) => entry.label === wait.label);
  if (found) found.done = found.done && wait.done;
  else list.push(wait);
}

export function buildProductionPlan(input: ProductionPlanInput): PlanDay[] {
  const events = new Map(live(input.events).map((row) => [row._id, row]));
  const steps = new Map(input.dishTasks.map((row) => [row._id, row]));
  const stationRows = new Map(input.stations.map((row) => [row._id, row]));
  const componentNames = new Map(
    input.components.map((row) => [row._id, row.name ?? "Recipe"]),
  );
  const tasks = live(input.prepTasks).filter(
    (task) => String(task.status) !== "cancelled" && events.has(task.eventId),
  );
  const taskById = new Map(tasks.map((task) => [task._id, task]));
  const eventTitle = (id: string) => events.get(id)?.title || "Untitled event";
  const stationOf = (task: PlanPrepTask) =>
    (task.stationId ? stationRows.get(task.stationId)?.name : null) ||
    task.station?.trim() ||
    NO_STATION;

  const rows = new Map<string, PlanWorkRow>();
  const rowByTask = new Map<string, PlanWorkRow>();

  for (const task of tasks) {
    const event = events.get(task.eventId);
    const step = task.dishTaskId ? steps.get(task.dishTaskId) : undefined;
    const window = makeAheadWindow(step, event?.startsAt);
    const day =
      task.dueAt != null
        ? planDayKey(task.dueAt)
        : window
          ? window.latestDay
          : event?.startsAt != null
            ? planDayKey(event.startsAt)
            : NO_DAY;
    const station = stationOf(task);
    const unit = String(task.unit);
    const stepKey = task.dishTaskId ?? `${task.componentId ?? ""}:${task.name}`;
    const key = `prep|${day}|${station}|${stepKey}|${unit}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        kind: "prep",
        day,
        station,
        recipe:
          (task.componentId && componentNames.get(task.componentId)) ||
          task.name,
        step: task.name,
        unit,
        planned: 0,
        made: 0,
        surplus: 0,
        done: true,
        batchId: null,
        shares: [],
        makeAhead: window,
        waitsFor: [],
      };
      rows.set(key, row);
    }
    const done = String(task.status) === "completed";
    const made = done ? (task.completedQuantity ?? task.quantity) : 0;
    row.planned += task.quantity;
    row.made += made;
    row.done = row.done && done;
    row.shares.push({
      eventId: task.eventId,
      eventTitle: eventTitle(task.eventId),
      sourceId: task._id,
      quantity: task.quantity,
      made,
      done,
    });
    if (step?.sequenceAfterDishTaskId) {
      const before = steps.get(step.sequenceAfterDishTaskId);
      const sameEventBefore = tasks.filter(
        (other) =>
          other.eventId === task.eventId &&
          other.dishTaskId === step.sequenceAfterDishTaskId,
      );
      addWait(row.waitsFor, {
        label: before?.name || "An earlier step",
        done: sameEventBefore.every(
          (other) => String(other.status) === "completed",
        ),
      });
    }
    rowByTask.set(task._id, row);
  }

  for (const link of input.dependencies) {
    if (link.requirementReleasedAt != null) continue;
    const row = rowByTask.get(link.dependentTaskId);
    const before = taskById.get(link.predecessorTaskId);
    if (!row || !before) continue;
    addWait(row.waitsFor, {
      label: before.name,
      done: String(before.status) === "completed",
    });
  }

  const allocationsByBatch = new Map<string, PlanAllocation[]>();
  for (const allocation of live(input.allocations)) {
    if (String(allocation.status) === "released") continue;
    const list = allocationsByBatch.get(allocation.productionBatchId) ?? [];
    list.push(allocation);
    allocationsByBatch.set(allocation.productionBatchId, list);
  }

  for (const batch of live(input.batches)) {
    if (String(batch.status) === "cancelled") continue;
    const owned = (allocationsByBatch.get(batch._id) ?? []).filter(
      (allocation) =>
        !allocation.isSurplus &&
        allocation.eventId &&
        events.has(allocation.eventId),
    );
    const done = String(batch.status) === "completed";
    const shares: PlanEventShare[] = owned.length
      ? owned.map((allocation) => ({
          eventId: allocation.eventId!,
          eventTitle: eventTitle(allocation.eventId!),
          sourceId: allocation._id,
          quantity: allocation.allocatedQuantity,
          made: done ? allocation.allocatedQuantity : 0,
          done,
        }))
      : batch.eventId && events.has(batch.eventId)
        ? [
            {
              eventId: batch.eventId,
              eventTitle: eventTitle(batch.eventId),
              sourceId: batch._id,
              quantity: batch.plannedYield,
              made: done ? (batch.actualYield ?? 0) : 0,
              done,
            },
          ]
        : [];
    if (shares.length === 0) continue;
    const starts = shares
      .map((share) => events.get(share.eventId)?.startsAt)
      .filter((ms): ms is number => ms != null);
    const day =
      batch.productionDate != null
        ? planDayKey(batch.productionDate)
        : starts.length
          ? planDayKey(Math.min(...starts))
          : NO_DAY;
    const shareEvents = new Set(shares.map((share) => share.eventId));
    const usedBy = tasks.filter(
      (task) =>
        task.componentId === batch.componentId && shareEvents.has(task.eventId),
    );
    const recipe = componentNames.get(batch.componentId) ?? "Recipe";
    const row: PlanWorkRow = {
      key: `batch|${batch._id}`,
      kind: "batch",
      day,
      station: usedBy.length ? stationOf(usedBy[0]!) : NO_STATION,
      recipe,
      step: `Batch of ${recipe}`,
      unit: String(batch.yieldUnit),
      planned: batch.plannedYield,
      made: done ? (batch.actualYield ?? 0) : 0,
      surplus: batch.surplusQuantity ?? 0,
      done,
      batchId: batch._id,
      shares,
      makeAhead: null,
      waitsFor: [],
    };
    rows.set(row.key, row);
    // Steps that use this recipe wait for the batch that makes it.
    for (const task of usedBy) {
      const taskRow = rowByTask.get(task._id);
      if (taskRow) addWait(taskRow.waitsFor, { label: row.step, done });
    }
  }

  const stationOrder = (name: string) => {
    const found = input.stations.find((row) => row.name === name);
    return found?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  };
  const days = new Map<string, Map<string, PlanWorkRow[]>>();
  for (const row of rows.values()) {
    const stations = days.get(row.day) ?? new Map<string, PlanWorkRow[]>();
    stations.set(row.station, [...(stations.get(row.station) ?? []), row]);
    days.set(row.day, stations);
  }
  return [...days.entries()]
    .sort(([a], [b]) =>
      a === NO_DAY ? 1 : b === NO_DAY ? -1 : a.localeCompare(b),
    )
    .map(([day, stations]) => ({
      day,
      stations: [...stations.entries()]
        .sort(
          ([a], [b]) =>
            (a === NO_STATION ? 1 : 0) - (b === NO_STATION ? 1 : 0) ||
            stationOrder(a) - stationOrder(b) ||
            a.localeCompare(b),
        )
        .map(([station, list]) => ({
          station,
          rows: list.sort(
            (a, b) =>
              (a.kind === "batch" ? 0 : 1) - (b.kind === "batch" ? 0 : 1) ||
              a.recipe.localeCompare(b.recipe) ||
              a.step.localeCompare(b.step),
          ),
        })),
    }));
}
