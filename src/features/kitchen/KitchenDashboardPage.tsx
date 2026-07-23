import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTime } from "../../lib/format";
import {
  useListDish,
  useListEvent,
  useListEventDish,
  useListPerson,
  useListPrepTask,
  useListRecipe,
  useListVenue,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskRevise,
  usePrepTaskStart,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { AllergenIconRow } from "./AllergenIconRow";
import { DishPrimaryImage } from "./DishPrimaryImage";
import { KitchenBookNav } from "./KitchenBookNav";
import { eventDetailMenuPath, recipePath } from "./kitchenRoutes";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Week-scoped Kitchen Dashboard: Event → Dish → Prep Task. */
export function KitchenDashboardPage() {
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const recipes = useListRecipe();
  const tasks = useListPrepTask();
  const people = useListPerson();
  const venues = useListVenue();
  const claim = usePrepTaskClaim();
  const start = usePrepTaskStart();
  const complete = usePrepTaskComplete();
  const revise = usePrepTaskRevise();
  const [weekOffset, setWeekOffset] = useState(0);
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const weekEvents = useMemo(() => {
    return (events ?? [])
      .filter((event) => event.deletedAt == null)
      .filter((event) => {
        const start = Number(event.startsAt ?? 0);
        return start >= weekStart.getTime() && start < weekEnd.getTime();
      })
      .filter((event) => !eventFilter || event._id === eventFilter)
      .sort((a, b) => Number(a.startsAt) - Number(b.startsAt));
  }, [eventFilter, events, weekEnd, weekStart]);

  const loading =
    events === undefined ||
    eventDishes === undefined ||
    dishes === undefined ||
    tasks === undefined;

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

  return (
    <div className="culinary-document culinary-document-compact space-y-4">
      <KitchenBookNav />
      <header className="space-y-2">
        <p className="eyebrow">Kitchen</p>
        <h1 className="culinary-title-compact">Weekly prep dashboard</h1>
        <p className="text-[13px] text-ink-2">
          Week of {formatDate(weekStart.getTime())} — organized by event, dish,
          then prep task.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset((value) => value - 1)}
          >
            Previous week
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset(0)}
          >
            This week
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setWeekOffset((value) => value + 1)}
          >
            Next week
          </button>
        </div>
        <label className="field-label">
          Event
          <select
            className="field-input"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="">All events</option>
            {weekEvents.map((event) => (
              <option key={event._id} value={event._id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Status
          <select
            className="field-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label className="field-label">
          Assignee
          <select
            className="field-input"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">Anyone</option>
            {(people ?? [])
              .filter((person) => person.deletedAt == null)
              .map((person) => (
                <option key={person._id} value={person._id}>
                  {[person.givenName, person.familyName]
                    .filter(Boolean)
                    .join(" ") || person._id}
                </option>
              ))}
          </select>
        </label>
      </div>

      {failure ? <CulinaryFailureBanner error={failure} /> : null}
      {loading ? <TableSkeleton rows={6} /> : null}

      {!loading && weekEvents.length === 0 ? (
        <div className="document-empty">
          <p>
            No events scheduled this week. Change the week filter or add events.
          </p>
        </div>
      ) : null}

      <div className="space-y-6">
        {weekEvents.map((event) => {
          const venue = venues?.find((row) => row._id === event.venueId);
          const selections = (eventDishes ?? []).filter(
            (row) => row.deletedAt == null && row.eventId === event._id,
          );
          const eventTasks = (tasks ?? []).filter(
            (task) =>
              task.deletedAt == null &&
              task.eventId === event._id &&
              (!statusFilter || task.status === statusFilter) &&
              (!assigneeFilter || task.assignedToId === assigneeFilter),
          );
          const completed = eventTasks.filter(
            (task) => task.status === "completed",
          ).length;
          const progress =
            eventTasks.length === 0
              ? "No prep tasks"
              : `${completed}/${eventTasks.length} complete`;

          return (
            <section
              key={event._id}
              className="border border-line bg-surface"
              data-testid="kitchen-dashboard-event"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-display text-lg text-ink">
                    {event.title}
                  </h2>
                  <p className="font-mono text-[12px] text-ink-2">
                    {formatDate(event.startsAt)} {formatTime(event.startsAt)}
                    {event.endsAt ? ` – ${formatTime(event.endsAt)}` : ""}
                    {" · "}
                    {venue?.name ?? "No venue"}
                    {" · "}
                    {event.expectedHeadcount ?? "—"} guests
                  </p>
                  <p className="text-[12px] text-ink-3">
                    Prep progress: {progress}
                  </p>
                </div>
                <Link
                  to={eventDetailMenuPath(event._id)}
                  className="btn btn-ghost"
                >
                  Open event
                </Link>
              </header>

              {selections.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ink-3">
                  No dishes on this event yet.{" "}
                  <Link
                    to={eventDetailMenuPath(event._id)}
                    className="underline"
                  >
                    Add dishes on the event menu tab
                  </Link>
                  .
                </p>
              ) : (
                selections.map((selection) => {
                  const dish = dishes?.find(
                    (row) => row._id === selection.dishId,
                  );
                  if (!dish) return null;
                  const recipe = dish.primaryRecipeId
                    ? recipes?.find((row) => row._id === dish.primaryRecipeId)
                    : null;
                  const dishTasks = eventTasks.filter(
                    (task) => task.eventDishId === selection._id,
                  );
                  const dishDone = dishTasks.filter(
                    (task) => task.status === "completed",
                  ).length;

                  return (
                    <div
                      key={selection._id}
                      className="border-t border-line px-4 py-3"
                      data-testid="kitchen-dashboard-dish"
                    >
                      <div className="flex flex-wrap gap-3">
                        <DishPrimaryImage
                          storageId={dish.primaryImageStorageId}
                          alt={dish.name}
                          size="thumb"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[15px] font-semibold">
                              {dish.name}
                            </h3>
                            <AllergenIconRow codes={dish.allergenSummary} />
                          </div>
                          <p className="font-mono text-[11px] text-ink-3">
                            {selection.quantityServings} servings
                            {recipe ? (
                              <>
                                {" · "}
                                <Link
                                  to={recipePath(recipe._id)}
                                  className="underline"
                                >
                                  {recipe.name}
                                </Link>
                              </>
                            ) : null}
                            {" · "}
                            {dishTasks.length
                              ? `${dishDone}/${dishTasks.length} tasks`
                              : "No prep tasks"}
                          </p>
                        </div>
                      </div>

                      {dishTasks.length === 0 ? (
                        <p className="mt-2 text-[12px] text-ink-3">
                          No prep tasks for this dish in the current filters.
                        </p>
                      ) : (
                        <ul className="mt-2 divide-y divide-line border border-line">
                          {dishTasks.map((task) => {
                            const assignee = people?.find(
                              (person) => person._id === task.assignedToId,
                            );
                            const taskRecipe = task.recipeId
                              ? recipes?.find(
                                  (row) => row._id === task.recipeId,
                                )
                              : null;
                            return (
                              <li
                                key={task._id}
                                className="grid gap-2 px-3 py-2 md:grid-cols-[1fr_auto]"
                                data-testid="kitchen-dashboard-task"
                              >
                                <div>
                                  <p className="text-[13px] font-medium">
                                    {task.name}
                                  </p>
                                  <p className="font-mono text-[11px] text-ink-3">
                                    {task.quantity} {String(task.unit)}
                                    {task.dueAt
                                      ? ` · due ${formatTime(task.dueAt)}`
                                      : ""}
                                    {assignee
                                      ? ` · ${[assignee.givenName, assignee.familyName].filter(Boolean).join(" ")}`
                                      : " · unassigned"}
                                    {taskRecipe ? (
                                      <>
                                        {" · "}
                                        <Link
                                          to={recipePath(taskRecipe._id)}
                                          className="underline"
                                        >
                                          {taskRecipe.name}
                                        </Link>
                                      </>
                                    ) : null}
                                  </p>
                                  {task.notes ? (
                                    <p className="text-[12px] text-ink-2">
                                      {task.notes}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusChip status={String(task.status)} />
                                  {task.status === "pending" ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      disabled={busy != null}
                                      onClick={() =>
                                        void run(`claim:${task._id}`, () =>
                                          claim({
                                            docId: task._id,
                                            version: task.version,
                                          }),
                                        )
                                      }
                                    >
                                      Claim
                                    </button>
                                  ) : null}
                                  {task.status === "claimed" ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      disabled={busy != null}
                                      onClick={() =>
                                        void run(`start:${task._id}`, () =>
                                          start({
                                            docId: task._id,
                                            version: task.version,
                                          }),
                                        )
                                      }
                                    >
                                      Start
                                    </button>
                                  ) : null}
                                  {task.status === "in_progress" ||
                                  task.status === "claimed" ? (
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      disabled={busy != null}
                                      onClick={() =>
                                        void run(`complete:${task._id}`, () =>
                                          complete({
                                            docId: task._id,
                                            version: task.version,
                                          }),
                                        )
                                      }
                                    >
                                      Complete
                                    </button>
                                  ) : null}
                                  {task.status === "pending" ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      disabled={busy != null}
                                      onClick={() => {
                                        const specialInstructions = window
                                          .prompt(
                                            "Special instructions",
                                            task.specialInstructions ?? "",
                                          )
                                          ?.trim();
                                        if (specialInstructions == null) return;
                                        void run(`notes:${task._id}`, () =>
                                          revise({
                                            docId: task._id,
                                            version: task.version,
                                            specialInstructions,
                                          }),
                                        );
                                      }}
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
