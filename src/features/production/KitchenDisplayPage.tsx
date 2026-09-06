import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useListEvent,
  useListPrepTask,
  useListPrepTaskDependency,
  useListProductionBatch,
  useListComponent,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskStart,
  useProductionBatchComplete,
  useProductionBatchStart,
} from "../../lib/manifest-convex-react";
import { useOptimisticStatus } from "../../ui/useOptimisticStatus";
import { TableSkeleton } from "../../ui/primitives";
import { formatStatusLabel } from "../../lib/statusLabels";
import { ProductionFailureBanner } from "./ProductionFailureBanner";
import { ProductionLifecyclePolicy } from "./ProductionLifecyclePolicy";
import {
  prepTaskDependencyLabel,
  prepTaskDependencySummary,
  type PrepTaskDependencySummary,
} from "./PrepTaskDependencies";
import { prepQuantityLabel } from "../kitchen/prepQuantityLabel";
import "./KitchenDisplayPage.css";

const policy = new ProductionLifecyclePolicy();

// One primary "bump" action per status keeps the floor UI one-tap.
const PREP_BUMP: Record<string, { key: string; label: string }> = {
  pending: { key: "claim", label: "Claim" },
  claimed: { key: "start", label: "Start" },
  in_progress: { key: "complete", label: "Done" },
};

const BATCH_BUMP: Record<string, { key: string; label: string }> = {
  planned: { key: "start", label: "Start" },
  in_progress: { key: "complete", label: "Done" },
};

type BoardItem = {
  kind: "task" | "batch";
  id: string;
  version: number;
  title: string;
  detail: string;
  station: string | null;
  eventId: string | null;
  status: string;
  dueAt: number | null;
  plannedYield?: number;
  dependency?: PrepTaskDependencySummary;
};

function urgencyRank(item: BoardItem, now: number): number {
  if (item.status === "blocked") return 0;
  if (item.dueAt != null && item.dueAt < now) return 1;
  return 2;
}

function dueLabel(dueAt: number | null, now: number): string {
  if (dueAt == null) return "No due time";
  const minutes = Math.round((dueAt - now) / 60000);
  if (minutes < 0) return `${Math.abs(minutes)}m overdue`;
  if (minutes < 60) return `Due in ${minutes}m`;
  return `Due ${new Date(dueAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function KitchenDisplayPage() {
  const tasks = useListPrepTask();
  const dependencies = useListPrepTaskDependency();
  const batches = useListProductionBatch();
  const events = useListEvent();
  const components = useListComponent();
  const claim = usePrepTaskClaim();
  const start = usePrepTaskStart();
  const complete = usePrepTaskComplete();
  const batchStart = useProductionBatchStart();
  const batchComplete = useProductionBatchComplete();
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [actualYields, setActualYields] = useState<Record<string, string>>({});
  const optimistic = useOptimisticStatus();
  const now = Date.now();

  const isLoading =
    tasks === undefined ||
    dependencies === undefined ||
    batches === undefined ||
    events === undefined ||
    components === undefined;

  const eventName = (id: string | null) =>
    (id && events?.find((event) => event._id === id)?.title) || "House";
  const componentName = (id: string) =>
    components?.find((component) => component._id === id)?.name ?? "Component";

  const items: BoardItem[] = [
    ...(tasks ?? [])
      .filter(
        (task) =>
          task.deletedAt == null &&
          ["pending", "claimed", "in_progress", "blocked"].includes(
            String(task.status),
          ),
      )
      .map((task): BoardItem => {
        const dependency = prepTaskDependencySummary(
          task._id,
          tasks ?? [],
          dependencies ?? [],
        );
        return {
          kind: "task",
          id: task._id,
          version: task.version,
          title: task.name?.trim() || "Prep task",
          detail: `${prepQuantityLabel(task.quantity, String(task.unit))} ${task.unit}`,
          station: task.station?.trim() || null,
          eventId: task.eventId,
          status: optimistic.statusOf(task._id, String(task.status)),
          dueAt: task.dueAt ?? null,
          dependency,
        };
      }),
    ...(batches ?? [])
      .filter(
        (batch) =>
          batch.deletedAt == null &&
          ["planned", "in_progress"].includes(String(batch.status)),
      )
      .map((batch): BoardItem => ({
        kind: "batch",
        id: batch._id,
        version: batch.version,
        title: componentName(batch.componentId),
        detail: `Batch · ${batch.plannedYield} ${batch.yieldUnit}`,
        station: null,
        eventId: batch.eventId ?? null,
        status: optimistic.statusOf(batch._id, String(batch.status)),
        dueAt: null,
        plannedYield: batch.plannedYield,
      })),
  ]
    .filter(
      (item) =>
        eventFilter === "all" || (item.eventId ?? "house") === eventFilter,
    )
    .sort((left, right) => {
      const rank = urgencyRank(left, now) - urgencyRank(right, now);
      if (rank !== 0) return rank;
      return (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity);
    });

  const filterEvents = (events ?? []).filter(
    (event) =>
      event.deletedAt == null &&
      ["approved", "executing"].includes(String(event.stage)),
  );

  const bump = async (item: BoardItem) => {
    const action =
      item.kind === "task" ? PREP_BUMP[item.status] : BATCH_BUMP[item.status];
    if (
      !action ||
      busy ||
      (item.kind === "task" &&
        action.key === "start" &&
        item.dependency?.isBlocked)
    )
      return;
    setFailure(null);
    setBusy(item.id);
    const nextStatus =
      item.kind === "task"
        ? policy.prepNextStatus(action.key, item.status)
        : action.key === "start"
          ? "in_progress"
          : "completed";
    if (nextStatus) optimistic.begin(item.id, nextStatus);
    try {
      if (item.kind === "task") {
        const args = { docId: item.id, version: item.version };
        if (action.key === "claim") await claim(args);
        else if (action.key === "start") await start(args);
        else await complete(args);
      } else if (action.key === "start") {
        await batchStart({ docId: item.id, version: item.version });
      } else {
        const enteredYield = actualYields[item.id];
        const actualYield = Number(enteredYield);
        if (
          enteredYield == null ||
          enteredYield.trim() === "" ||
          !Number.isFinite(actualYield) ||
          actualYield < 0
        ) {
          throw new Error("Enter a nonnegative actual batch yield.");
        }
        await batchComplete({
          docId: item.id,
          version: item.version,
          actualYield,
        });
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
      optimistic.end(item.id);
    }
  };

  return (
    <main className="kds" aria-label="Kitchen display board">
      <header className="kds-header">
        <div>
          <h1>Kitchen display</h1>
          <p>Live prep &amp; production · sorted by urgency</p>
        </div>
        <div className="kds-header-controls">
          <select
            className="kds-filter"
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
            aria-label="Filter by event"
          >
            <option value="all">All events</option>
            <option value="house">House (no event)</option>
            {filterEvents.map((event) => (
              <option key={event._id} value={event._id}>
                {event.title}
              </option>
            ))}
          </select>
          <Link to="/kitchen/prep" className="kds-exit">
            Exit
          </Link>
        </div>
      </header>
      {failure != null ? <ProductionFailureBanner error={failure} /> : null}
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : items.length === 0 ? (
        <p className="kds-empty">All caught up — nothing in progress.</p>
      ) : (
        <ul className="kds-grid">
          {items.map((item) => {
            const bumpAction =
              item.kind === "task"
                ? PREP_BUMP[item.status]
                : BATCH_BUMP[item.status];
            const overdue = item.dueAt != null && item.dueAt < now;
            const dependencyBlocked =
              item.kind === "task" &&
              bumpAction?.key === "start" &&
              item.dependency?.isBlocked === true;
            return (
              <li
                key={item.id}
                className={`kds-card kds-${item.status}${overdue ? " kds-overdue" : ""}${dependencyBlocked ? " kds-waiting" : ""}`}
              >
                <div className="kds-card-top">
                  <span className="kds-status">
                    {formatStatusLabel(item.status)}
                  </span>
                  <span
                    className={overdue ? "kds-due kds-due-late" : "kds-due"}
                  >
                    {item.kind === "batch"
                      ? "Batch"
                      : dueLabel(item.dueAt, now)}
                  </span>
                </div>
                <h2>{item.title}</h2>
                <p className="kds-detail">
                  {item.detail} · {eventName(item.eventId)}
                  {item.station ? ` · ${item.station}` : ""}
                </p>
                {item.kind === "task" &&
                item.dependency &&
                item.dependency.total > 0 ? (
                  <p
                    id={`kds-dependencies-${item.id}`}
                    className={
                      item.dependency.isBlocked
                        ? "kds-sequence is-waiting"
                        : "kds-sequence is-ready"
                    }
                  >
                    <span aria-hidden="true">
                      {item.dependency.isBlocked ? "↳" : "✓"}
                    </span>{" "}
                    {prepTaskDependencyLabel(item.dependency)}
                  </p>
                ) : null}
                {item.kind === "batch" && bumpAction?.key === "complete" ? (
                  <label className="kds-detail">
                    Actual yield ({item.detail.split(" ").at(-1)})
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="any"
                      required
                      aria-label={`Actual yield for ${item.title} in ${item.detail.split(" ").at(-1)}`}
                      value={actualYields[item.id] ?? ""}
                      onChange={(event) =>
                        setActualYields((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                {bumpAction ? (
                  <button
                    className="kds-bump"
                    disabled={busy != null || dependencyBlocked}
                    aria-busy={busy === item.id}
                    aria-describedby={
                      item.kind === "task" && item.dependency?.total
                        ? `kds-dependencies-${item.id}`
                        : undefined
                    }
                    onClick={() => bump(item)}
                  >
                    {busy === item.id
                      ? "…"
                      : dependencyBlocked
                        ? "Start locked"
                        : bumpAction.label}
                  </button>
                ) : (
                  <span className="kds-blocked-note">
                    Blocked — resolve on the prep board
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
