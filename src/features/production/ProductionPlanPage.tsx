import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListComponent,
  useListDishTask,
  useListPrepTask,
  useListPrepTaskDependency,
  useListProductionBatch,
  useListProductionBatchAllocation,
  useListStation,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { useEventsById } from "../facilities/useEventsById";
import { KitchenBookNav } from "../kitchen/KitchenBookNav";
import { prepQuantityLabel } from "../kitchen/prepQuantityLabel";
import {
  buildProductionPlan,
  NO_DAY,
  planDayKey,
  type MakeAheadWindow,
  type PlanDay,
  type ProductionPlanInput,
} from "../../../convex/lib/culinaryModel/productionPlan";

import "./ProductionYieldDashboardPage.css";
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const shortDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function planDayLabel(key: string): string {
  return key === NO_DAY ? "No day set yet" : dayFormat.format(fromKey(key));
}

export function makeAheadLabel(window: MakeAheadWindow | null): string {
  if (!window) return "Not set";
  const days =
    window.minDays === window.maxDays
      ? `${window.maxDays}`
      : `${window.minDays}–${window.maxDays}`;
  const range =
    window.earliestDay === window.latestDay
      ? shortDay.format(fromKey(window.latestDay))
      : `${shortDay.format(fromKey(window.earliestDay))} – ${shortDay.format(fromKey(window.latestDay))}`;
  const noun = window.maxDays === 1 ? "day" : "days";
  return `Make ${days} ${noun} ahead (${range})`;
}

// Count words read "45 portions"; "1 portion" and short marks stay as they are.
const COUNTED = ["portion", "serving", "piece", "tray", "pan"];
const amount = (value: number, unit: string) => {
  const label = prepQuantityLabel(value, unit);
  const word =
    COUNTED.includes(unit) && Number(label) !== 1
      ? `${unit}s`
      : unit.replaceAll("_", " ");
  return `${label} ${word}`;
};

export function ProductionPlanView({
  days,
  loading = false,
  today,
}: {
  days: readonly PlanDay[];
  loading?: boolean;
  today: string;
}) {
  const [showEarlier, setShowEarlier] = useState(false);
  const shown = days.filter(
    (day) => showEarlier || day.day === NO_DAY || day.day >= today,
  );
  const earlier = days.length - shown.length;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Production</p>
          <h1 className="display-title mt-2">Production plan</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            What the kitchen makes each day, by station and recipe. Work for the
            same step on the same day is pooled, and each event keeps its own
            amount.
          </p>
        </div>
      </header>

      <KitchenBookNav />

      {earlier > 0 || showEarlier ? (
        <p className="mt-4">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowEarlier((value) => !value)}
          >
            {showEarlier
              ? "Hide earlier days"
              : `Show ${earlier} earlier ${earlier === 1 ? "day" : "days"}`}
          </button>
        </p>
      ) : null}

      {loading ? (
        <section className="production-yield-panel">
          <TableSkeleton rows={6} />
        </section>
      ) : shown.length === 0 ? (
        <section className="production-yield-panel">
          <div className="document-empty">
            <p>No kitchen work is planned from today on.</p>
            <span>
              Prep and batches show here once an event has a menu with recipe
              steps.
            </span>
          </div>
        </section>
      ) : (
        shown.map((day) => (
          <section
            key={day.day}
            className="production-yield-panel"
            data-testid="production-plan-day"
            aria-label={planDayLabel(day.day)}
          >
            <h2 className="text-lg font-semibold">{planDayLabel(day.day)}</h2>
            {day.stations.map((group) => (
              <div key={group.station} className="mt-4">
                <h3 className="meta-term">{group.station}</h3>
                <div className="supply-table-wrap">
                  <table className="supply-table">
                    <thead>
                      <tr>
                        <th scope="col">Recipe / step</th>
                        <th scope="col">Events</th>
                        <th scope="col">To make</th>
                        <th scope="col">Made</th>
                        <th scope="col">Make ahead</th>
                        <th scope="col">Waits for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.key} data-testid="production-plan-row">
                          <td>
                            <strong>{row.recipe}</strong>
                            {row.step !== row.recipe ? (
                              <small className="block text-ink-3">
                                {row.step}
                              </small>
                            ) : null}
                            {row.kind === "batch" ? (
                              <small className="block text-ink-3">
                                Batch
                                {row.surplus > 0
                                  ? ` · ${amount(row.surplus, row.unit)} extra`
                                  : ""}
                              </small>
                            ) : null}
                          </td>
                          <td>
                            <ul>
                              {row.shares.map((share) => (
                                <li key={share.sourceId}>
                                  <Link to={`/events/${share.eventId}`}>
                                    {share.eventTitle}
                                  </Link>{" "}
                                  {amount(share.quantity, row.unit)}
                                  {share.done ? " · done" : ""}
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td>{amount(row.planned, row.unit)}</td>
                          <td>
                            {row.made > 0 || row.done
                              ? amount(row.made, row.unit)
                              : "Not yet"}
                          </td>
                          <td>{makeAheadLabel(row.makeAhead)}</td>
                          <td>
                            {row.waitsFor.length === 0 ? (
                              "Nothing"
                            ) : (
                              <ul>
                                {row.waitsFor.map((wait) => (
                                  <li key={wait.label}>
                                    {wait.label}
                                    {wait.done ? " · ready" : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

export function ProductionPlanPage() {
  const prepTasks = useListPrepTask();
  const dishTasks = useListDishTask();
  const batches = useListProductionBatch();
  const allocations = useListProductionBatchAllocation();
  // The plan only reads the events its own prep tasks and batches name.
  const eventIds = useMemo(
    () =>
      prepTasks && batches
        ? [
            ...prepTasks.map((task) => task.eventId),
            ...batches.map((batch) => batch.eventId),
            ...(allocations ?? []).map((allocation) => allocation.eventId),
          ]
        : undefined,
    [prepTasks, batches, allocations],
  );
  const events = useEventsById(eventIds);
  const dependencies = useListPrepTaskDependency();
  const stations = useListStation();
  const components = useListComponent();
  const loading =
    events === undefined ||
    prepTasks === undefined ||
    dishTasks === undefined ||
    batches === undefined;
  const days = useMemo(
    () =>
      buildProductionPlan({
        // Finished and cancelled events need no more prep.
        events: (events ?? []).filter(
          (event) =>
            !["cancelled", "completed", "closed_out"].includes(
              String(event.stage),
            ),
        ),
        prepTasks: prepTasks ?? [],
        dishTasks: dishTasks ?? [],
        batches: batches ?? [],
        allocations: allocations ?? [],
        dependencies: dependencies ?? [],
        stations: stations ?? [],
        components: components ?? [],
      } as unknown as ProductionPlanInput),
    [
      events,
      prepTasks,
      dishTasks,
      batches,
      allocations,
      dependencies,
      stations,
      components,
    ],
  );
  return (
    <ProductionPlanView
      days={days}
      loading={loading}
      today={planDayKey(Date.now())}
    />
  );
}
