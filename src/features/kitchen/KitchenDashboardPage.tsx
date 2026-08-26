import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  useListDish,
  useListEvent,
  useListEventDish,
  useListPerson,
  useListPrepTask,
  useListComponent,
  useListVenue,
  usePrepTaskAssign,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskRelease,
  usePrepTaskStart,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { formatStatusLabel } from "../../lib/statusLabels";
import { eventMenuRedirectPath, eventsIndexPath } from "../events/eventRoutes";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { ActionMenu, TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { KitchenBookNav } from "./KitchenBookNav";
import { KitchenCommandDeckFilters } from "./command-deck/KitchenCommandDeckFilters";
import { KitchenCommandDeckHorizon } from "./command-deck/KitchenCommandDeckHorizon";
import { KitchenCommandDeckModel } from "./command-deck/KitchenCommandDeckModel";
import type {
  CommandDeckFilter,
  EventLike,
  PrepTaskLike,
} from "./command-deck/KitchenCommandDeckTypes";

/** One prep task with the service it belongs to. */
type LedgerRow = { task: PrepTaskLike; event: EventLike };
import { KitchenPrepAssignManager } from "./command-deck/KitchenPrepAssignManager";
import "./command-deck/KitchenCommandDeck.css";
import "./command-deck/KitchenCommandDeckSurfaces.css";
import { useEventMenuSync } from "./useEventMenuSync";

/** Kitchen command deck: 7-day horizon, assign cooks to dishes/steps, crew load. */
export function KitchenDashboardPage() {
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const components = useListComponent();
  const tasks = useListPrepTask();
  const people = useListPerson();
  const venues = useListVenue();
  const authStatus = useAuthStatus();

  const assign = usePrepTaskAssign();
  const claim = usePrepTaskClaim();
  const release = usePrepTaskRelease();
  const start = usePrepTaskStart();
  const complete = usePrepTaskComplete();
  const { ready: prepSyncReady, syncPrepForDish } = useEventMenuSync();

  const [horizonOffset, setHorizonOffset] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [filter, setFilter] = useState<CommandDeckFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [armedPersonId, setArmedPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [attentionAll, setAttentionAll] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [toast, setToast] = useState<string | null>(null);

  const horizon = useMemo(
    () => new KitchenCommandDeckHorizon(7, horizonOffset),
    [horizonOffset],
  );

  const model = useMemo(
    () =>
      new KitchenCommandDeckModel(
        events ?? [],
        eventDishes ?? [],
        dishes ?? [],
        tasks ?? [],
        people ?? [],
        horizon,
      ),
    [dishes, eventDishes, events, horizon, people, tasks],
  );

  const actions = useMemo(
    () => new KitchenPrepAssignManager(assign, release, claim, start, complete),
    [assign, claim, complete, release, start],
  );

  const horizonEvents = model.horizonEvents();

  useEffect(() => {
    if (!selectedEventId && horizonEvents[0]) {
      setSelectedEventId(horizonEvents[0]._id);
      return;
    }
    if (
      selectedEventId &&
      horizonEvents.length > 0 &&
      !horizonEvents.some((e) => e._id === selectedEventId)
    ) {
      setSelectedEventId(horizonEvents[0]?._id ?? "");
    }
  }, [horizonEvents, selectedEventId]);

  const selectedEvent = horizonEvents.find((e) => e._id === selectedEventId);
  const crewRows = model.crewLoad(horizonEvents.map((e) => e._id));
  const assignableInView = selectedEvent
    ? model.assignableTasks(
        model.filterTasks(selectedEvent._id, filter, assigneeFilter),
      ).length
    : 0;

  const loading =
    events === undefined ||
    eventDishes === undefined ||
    dishes === undefined ||
    tasks === undefined ||
    people === undefined;

  const showToast = (message: string) => {
    setToast(message);
    globalThis.setTimeout(() => setToast(null), 1800);
  };

  const run = async (
    key: string,
    work: () => Promise<void>,
    okMessage?: string,
  ) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      if (okMessage) showToast(okMessage);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const requireArmed = (): string | null => {
    if (!armedPersonId) {
      showToast("Arm a cook in the workbench first");
      return null;
    }
    return armedPersonId;
  };

  const onAssignTask = (task: PrepTaskLike) => {
    const personId = requireArmed();
    if (!personId) return;
    const label = model.personLabel(model.findPerson(personId));
    void run(
      `assign:${task._id}`,
      () => actions.assignOne(task, personId),
      `Assigned → ${label}`,
    );
  };

  const onAssignDish = (dishTasks: PrepTaskLike[]) => {
    const personId = requireArmed();
    if (!personId) return;
    const label = model.personLabel(model.findPerson(personId));
    void run(`assign-dish:${dishTasks[0]?._id ?? "x"}`, async () => {
      const count = await actions.assignMany(dishTasks, personId);
      showToast(`${formatCountNoun(count, "task")} → ${label}`);
    });
  };

  // Same guarded calls the board has always made, named once so the ledger
  // and the workbench can both reach them.
  const onClaimTask = (task: PrepTaskLike) => {
    // PrepTask.claim writes user.personId into a Person FK, so it fails
    // outright for a sign-in with no staff profile. Say that instead of
    // surfacing a bare "Action failed unexpectedly".
    if (!authStatus?.personId) {
      setFailure(
        new Error(
          "Your sign-in isn't linked to a staff profile yet, so it can't hold prep work. Ask an admin to link it under Administration → Team roles — or arm a cook and use Assign.",
        ),
      );
      return;
    }
    void run(`claim:${task._id}`, () => actions.claimOne(task), "Claimed");
  };
  const onStartTask = (task: PrepTaskLike) =>
    void run(`start:${task._id}`, () => actions.startOne(task), "Started");
  const onCompleteTask = (task: PrepTaskLike) =>
    void run(
      `complete:${task._id}`,
      () => actions.completeOne(task),
      "Completed",
    );

  const onSyncPrep = () => {
    if (!selectedEvent) return;
    void run(
      `sync:${selectedEvent._id}`,
      async () => {
        const rows = model.selections(selectedEvent._id);
        if (rows.length === 0) {
          throw new Error(
            "No dishes on this event, so Sync prep has nothing to create.",
          );
        }
        const reasons: string[] = [];
        let created = 0;
        for (const row of rows) {
          const result = await syncPrepForDish({
            id: row._id,
            eventId: selectedEvent._id,
            dishId: row.dishId,
            quantityServings: Number(row.quantityServings) || 1,
          });
          created += result.taskCount;
          if (result.noOpReason) reasons.push(result.noOpReason);
        }
        if (created === 0 && reasons.length > 0) {
          throw new Error(reasons[0] ?? "Sync prep did nothing.");
        }
      },
      "Prep synced from the event menu",
    );
  };
  // ── Ledger ────────────────────────────────────────────────────────────
  // Prep across the whole horizon, not one event at a time. Every existing
  // filter still decides membership — filterTasks is called per event and
  // concatenated, so status/assignee/date-window semantics are untouched.
  const horizonTasks = useMemo(() => {
    const scope = selectedEventId
      ? horizonEvents.filter((e) => e._id === selectedEventId)
      : horizonEvents;
    return scope.flatMap((e) =>
      model.filterTasks(e._id, filter, assigneeFilter).map((task) => ({
        task,
        event: e,
      })),
    );
  }, [horizonEvents, model, filter, assigneeFilter, selectedEventId]);

  const sections = useMemo(() => {
    const attention: LedgerRow[] = [];
    const active: LedgerRow[] = [];
    const upcoming: LedgerRow[] = [];
    const completed: LedgerRow[] = [];
    for (const row of horizonTasks) {
      const status = String(row.task.status);
      if (status === "completed") completed.push(row);
      else if (status === "blocked" || !row.task.assignedToId)
        attention.push(row);
      else if (status === "in_progress" || status === "claimed")
        active.push(row);
      else upcoming.push(row);
    }
    const byTime = (a: LedgerRow, b: LedgerRow) =>
      Number(a.event.startsAt ?? 0) - Number(b.event.startsAt ?? 0);
    return [
      {
        id: "attention",
        label: "Needs attention",
        rows: attention.sort(byTime),
      },
      { id: "active", label: "Active preparation", rows: active.sort(byTime) },
      {
        id: "upcoming",
        label: "Upcoming preparation",
        rows: upcoming.sort(byTime),
      },
      { id: "completed", label: "Completed", rows: completed.sort(byTime) },
    ];
  }, [horizonTasks]);

  // The masthead states the window, so it counts every service in it — not
  // whatever the status/event/assignee filters happen to be showing below.
  const windowTasks = useMemo(
    () => horizonEvents.flatMap((e) => model.tasksForEvent(e._id)),
    [horizonEvents, model],
  );
  const openTotal = windowTasks.filter(
    (t) => String(t.status) !== "completed",
  ).length;
  const blockedTotal = windowTasks.filter(
    (t) => String(t.status) === "blocked",
  ).length;

  /** Prep is due at its service; show that clock, not a raw date. */
  const dueLabel = (startsAt: unknown) => {
    const ms = Number(startsAt);
    if (!Number.isFinite(ms) || ms === 0) return "—";
    return `${formatDate(ms)} ${new Date(ms).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  };

  /** One next action per row, using the handlers already wired above. */
  const nextAction = (row: LedgerRow) => {
    const status = String(row.task.status);
    if (status === "completed") return null;
    // A cook armed in the crew rail is an instruction: the next action on any
    // assignable row becomes Assign, exactly as the old board behaved.
    if (armedPersonId && (status === "pending" || status === "claimed")) {
      return { label: "Assign", run: () => onAssignTask(row.task) };
    }
    if (status === "blocked") {
      return {
        label: "Open event",
        run: () => setSelectedEventId(row.event._id),
      };
    }
    if (status === "in_progress")
      return { label: "Complete", run: () => onCompleteTask(row.task) };
    if (status === "claimed")
      return { label: "Start", run: () => onStartTask(row.task) };
    if (!row.task.assignedToId)
      return { label: "Claim", run: () => onClaimTask(row.task) };
    return { label: "Start", run: () => onStartTask(row.task) };
  };

  const statusTone = (status: string) =>
    status === "blocked"
      ? "chip-state chip-state-danger"
      : status === "completed"
        ? "chip-state chip-state-ok"
        : status === "in_progress" || status === "claimed"
          ? "chip-state chip-state-warn"
          : "chip-meta";

  const ledgerRow = (row: LedgerRow) => {
    const action = nextAction(row);
    const owner = row.task.assignedToId
      ? model.personLabel(model.findPerson(String(row.task.assignedToId)))
      : "Unassigned";
    const busyHere =
      busy === `claim:${row.task._id}` ||
      busy === `start:${row.task._id}` ||
      busy === `complete:${row.task._id}`;
    return (
      <div
        key={String(row.task._id)}
        className="grid grid-cols-[minmax(0,1fr)_96px_136px_128px_112px] items-center gap-x-5 border-b border-line py-3.5 max-md:grid-cols-1 max-md:gap-y-1.5 max-md:py-4"
      >
        <div className="min-w-0">
          {/* Truncates in the desktop column; wraps on a phone, where the
              task name is the whole identity of the row. */}
          <div className="font-display text-xl text-ink md:truncate">
            {row.task.name}
          </div>
          {/* Event and due time sit under the name. As their own columns they
              starved the task identity down to a few characters. */}
          <div className="text-sm text-ink-2 max-md:hidden">
            {row.task.category ?? "Prep"} ·{" "}
            <button
              type="button"
              onClick={() => setSelectedEventId(row.event._id)}
              className="cursor-pointer hover:text-ink hover:underline"
            >
              {String(row.event.title)}
            </button>{" "}
            · due {dueLabel(row.event.startsAt)}
          </div>
        </div>
        <div className="font-mono text-base text-ink max-md:hidden">
          {row.task.quantity != null
            ? `${row.task.quantity} ${row.task.unit ?? ""}`.trim()
            : "—"}
        </div>
        <div className="truncate text-base text-ink-2 max-md:hidden">
          {owner}
        </div>
        {/* Phone: event, due, quantity and owner ride together on one honest
            line rather than being squeezed into columns that clip. */}
        <div className="text-sm text-ink-2 md:hidden">
          {String(row.event.title)} · due {dueLabel(row.event.startsAt)} ·{" "}
          {row.task.quantity != null
            ? `${row.task.quantity} ${row.task.unit ?? ""}`.trim()
            : "—"}{" "}
          · {owner}
        </div>
        <div className="max-md:mt-1">
          <span className={statusTone(String(row.task.status))}>
            {formatStatusLabel(String(row.task.status))}
          </span>
        </div>
        <div className="text-right max-md:mt-2 max-md:text-left">
          {action ? (
            <button
              type="button"
              disabled={busyHere}
              onClick={action.run}
              className="btn btn-ghost btn-sm h-11 md:h-8"
            >
              {busyHere ? "Working…" : action.label}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  // ── Phone composition ────────────────────────────────────────────────
  // Its own sections and rows. The desktop ledger above is untouched.
  const mobileAttention = useMemo(
    () =>
      horizonTasks.filter((r) => {
        const s = String(r.task.status);
        return s !== "completed" && (s === "blocked" || !r.task.assignedToId);
      }),
    [horizonTasks],
  );
  const mobileUrgent = mobileAttention[0] ?? null;
  const mobileOpen = horizonTasks.filter(
    (r) => String(r.task.status) !== "completed",
  ).length;
  const mobileBlocked = horizonTasks.filter(
    (r) => String(r.task.status) === "blocked",
  ).length;
  const mobileServices = selectedEventId ? 1 : horizonEvents.length;
  const sheetTotals = useMemo(() => {
    const s2 = horizonTasks.map((r) => String(r.task.status));
    return {
      total: s2.length,
      doing: s2.filter((x) => x === "in_progress" || x === "claimed").length,
      blocked: s2.filter((x) => x === "blocked").length,
      done: s2.filter((x) => x === "completed").length,
    };
  }, [horizonTasks]);

  const mobileSections = useMemo(() => {
    const inProgress: LedgerRow[] = [];
    const upNext: LedgerRow[] = [];
    const done: LedgerRow[] = [];
    const urgentIds = new Set(mobileAttention.map((r) => String(r.task._id)));
    for (const row of horizonTasks) {
      if (urgentIds.has(String(row.task._id))) continue;
      const s = String(row.task.status);
      if (s === "completed") done.push(row);
      else if (s === "in_progress" || s === "claimed") inProgress.push(row);
      else upNext.push(row);
    }
    return [
      { id: "m-active", label: "In progress", rows: inProgress },
      { id: "m-next", label: "Up next", rows: upNext },
      { id: "m-done", label: "Completed", rows: done },
    ];
  }, [horizonTasks, mobileAttention]);

  // ── The printed prep sheet ────────────────────────────────────────────
  // work/list3.jpg and list5.jpg: category, then the item with its portion
  // basis, then that item's steps in order, each with its own quantity/unit.
  // The transcription in work/prep-lists-from-photos.csv names the columns.
  const SHEET_ORDER = [
    "Finish at Kitchen",
    "Finish at Event",
    "Drop Off",
    "Drop Off Items",
    "Bev - Non Alcohol",
    "Side Items",
  ];

  const prepSheet = useMemo(() => {
    const dishName = (id: unknown) =>
      dishes?.find((d) => d._id === String(id))?.name ?? null;
    const byCategory = new Map<string, Map<string, LedgerRow[]>>();
    for (const row of horizonTasks) {
      const category = String(row.task.category ?? "Other");
      const itemKey = String(
        row.task.eventDishId ?? row.task.dishId ?? row.task._id,
      );
      let items = byCategory.get(category);
      if (!items) byCategory.set(category, (items = new Map()));
      const steps = items.get(itemKey);
      if (steps) steps.push(row);
      else items.set(itemKey, [row]);
    }
    const rank = (c: string) => {
      const i = SHEET_ORDER.indexOf(c);
      return i < 0 ? SHEET_ORDER.length : i;
    };
    return [...byCategory.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([category, items]) => {
        const built = [...items.entries()].map(([key, steps]) => {
          const first = steps[0]!;
          const servings = eventDishes?.find(
            (ed) => ed._id === String(first.task.eventDishId),
          )?.quantityServings;
          return {
            key,
            // The sheet prints the ITEM (the dish); the step text is the row.
            name: (
              dishName(first.task.dishId) ??
              String(first.task.name).split("—")[0] ??
              "Item"
            )
              .trim()
              .toUpperCase(),
            portionBasis:
              servings != null ? `P: ${Number(servings)} Serving` : null,
            steps,
          };
        });
        const all = built.flatMap((i) => i.steps);
        return {
          category,
          items: built,
          totalSteps: all.length,
          doneSteps: all.filter((r) => String(r.task.status) === "completed")
            .length,
        };
      });
  }, [horizonTasks, dishes, eventDishes]);

  /** The sheet never repeats the item in its own steps: the heading already
   *  says CHICKEN ROULADE, so the step reads "PIPE PESTO CREAM", not
   *  "PIPE PESTO CREAM — Chicken Roulade". */
  const stepText = (raw: unknown, itemName: string) => {
    const text = String(raw ?? "").trim();
    const cut = text.split(/\s+[—-]\s+/);
    if (cut.length > 1) {
      const tail = cut[cut.length - 1]!.trim().toUpperCase();
      if (tail && itemName.includes(tail)) {
        return cut.slice(0, -1).join(" — ").trim();
      }
    }
    return text;
  };

  /** Prep names arrive shouting from the recipe import; calm them down. */
  const sentenceCase = (raw: unknown) => {
    const name = String(raw ?? "").trim();
    if (!name) return "Untitled task";
    const letters = name.replace(/[^A-Za-z]/g, "");
    if (letters && letters === letters.toUpperCase()) {
      return name.charAt(0) + name.slice(1).toLowerCase();
    }
    return name;
  };

  const mobileCollapsed = (row: LedgerRow) => {
    const owner = row.task.assignedToId
      ? model.personLabel(model.findPerson(String(row.task.assignedToId)))
      : "Unassigned";
    return (
      <button
        key={String(row.task._id)}
        type="button"
        onClick={() => setExpandedTaskId(String(row.task._id))}
        className="flex w-full cursor-pointer items-start justify-between gap-3 border-t border-line py-4 text-left"
      >
        <span className="min-w-0">
          <span className="font-display block text-xl leading-snug text-ink">
            {sentenceCase(row.task.name)}
          </span>
          <span className="mt-1 block text-sm text-ink-2">
            {String(row.event.title)} · {dueLabel(row.event.startsAt)} ·{" "}
            {row.task.quantity != null
              ? `${row.task.quantity} ${row.task.unit ?? ""}`.trim()
              : "—"}{" "}
            · {owner}
          </span>
        </span>
        <span className="shrink-0 self-center">
          <span className={statusTone(String(row.task.status))}>
            {formatStatusLabel(String(row.task.status))}
          </span>
        </span>
      </button>
    );
  };

  const mobileExpanded = (row: LedgerRow) => {
    const action = nextAction(row);
    const status = String(row.task.status);
    const owner = row.task.assignedToId
      ? model.personLabel(model.findPerson(String(row.task.assignedToId)))
      : "Unassigned";
    const busyHere =
      busy === `claim:${row.task._id}` ||
      busy === `start:${row.task._id}` ||
      busy === `complete:${row.task._id}` ||
      busy === `assign:${row.task._id}`;
    return (
      <div
        key={String(row.task._id)}
        className="border-t border-line pt-4 pb-1 first:border-t-0 first:pt-3"
      >
        <div className="font-display text-2xl leading-tight text-ink">
          {sentenceCase(row.task.name)}
        </div>
        {/* The service time IS the deadline: prepTasks.dueAt is null on every
            row, so a "Due" field here would be invented. State it once. */}
        <div className="mt-1 text-base text-ink-2">
          {String(row.event.title)} · service {dueLabel(row.event.startsAt)}
        </div>
        <div className="mt-2 text-base text-ink-2">
          {row.task.quantity != null
            ? `${row.task.quantity} ${row.task.unit ?? ""}`.trim()
            : "Quantity not set"}{" "}
          · {owner} · {formatStatusLabel(status)}
        </div>
        {status === "blocked" ? (
          <p className="mt-3 text-base text-danger">
            {String(
              (row.task as { blockReason?: string | null }).blockReason ??
                "Blocked — reason not recorded.",
            )}
          </p>
        ) : null}
        {action ? (
          <button
            type="button"
            disabled={busyHere}
            onClick={action.run}
            className="btn btn-primary mt-4 h-12 w-full justify-center"
          >
            {busyHere ? "Working…" : action.label}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="kitchen-command-deck pb-10">
      <div className="max-md:hidden">
        <KitchenBookNav />
      </div>

      {/* ───────────────── Phone ─────────────────
          A separate composition, not the desktop workbench shrunk down. The
          desktop board below is untouched and simply hidden here. */}
      <div className="md:hidden">
        <p className="font-display text-accent-deep text-lg italic underline underline-offset-4">
          {formatDate(horizon.start().getTime())} · 7-day window
        </p>
        <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
          Kitchen
        </h1>
        {/* Counts the scope shown below, not the whole window — a summary
            that disagrees with the list under it is worse than none. */}
        <p className="mt-2 text-base text-ink-2">
          {mobileOpen} open ·{" "}
          <span className={mobileBlocked > 0 ? "font-medium text-danger" : ""}>
            {mobileBlocked} blocked
          </span>{" "}
          · {mobileServices} {mobileServices === 1 ? "service" : "services"}
        </p>

        {/* Three controls, nothing else. The full filter form stays on desktop. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="btn btn-ghost h-11"
          >
            Filters
          </button>
          <label className="sr-only" htmlFor="kcd-m-service">
            Service
          </label>
          <select
            id="kcd-m-service"
            className="input h-11 min-w-0 flex-1"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">Every service</option>
            {horizonEvents.map((e) => (
              <option key={e._id} value={e._id}>
                {String(e.title)}
              </option>
            ))}
          </select>
          <ActionMenu>
            <Link to="/kitchen/yield">Yield variance</Link>
            <Link to="/kitchen">Components</Link>
            <Link to="/kitchen/ingredients">Ingredients</Link>
            <Link to="/kitchen/dishes">Dishes</Link>
            <Link to="/kitchen/menus">Menus</Link>
          </ActionMenu>
        </div>

        {/* Active filters read back as removable pills; nothing shows when
            nothing is filtering. */}
        {filter !== "all" || assigneeFilter || horizonOffset !== 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {filter !== "all" ? (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="chip-meta h-9 gap-2"
              >
                {formatStatusLabel(filter)} <span aria-hidden="true">×</span>
                <span className="sr-only">Clear status filter</span>
              </button>
            ) : null}
            {assigneeFilter ? (
              <button
                type="button"
                onClick={() => setAssigneeFilter("")}
                className="chip-meta h-9 gap-2"
              >
                {model.personLabel(model.findPerson(assigneeFilter))}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Clear assignee filter</span>
              </button>
            ) : null}
            {horizonOffset !== 0 ? (
              <button
                type="button"
                onClick={() => setHorizonOffset(0)}
                className="chip-meta h-9 gap-2"
              >
                From {formatDate(horizon.start().getTime())}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Back to today</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {filtersOpen ? (
          <div className="mt-4 border-y border-line py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <fieldset className="kcd-horizon-nav">
                <legend>Window</legend>
                <button
                  type="button"
                  onClick={() => setHorizonOffset((v) => v - 7)}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  data-active={horizonOffset === 0 ? "true" : "false"}
                  onClick={() => setHorizonOffset(0)}
                >
                  From today
                </button>
                <button
                  type="button"
                  onClick={() => setHorizonOffset((v) => v + 7)}
                >
                  Later
                </button>
              </fieldset>
              <KitchenCommandDeckFilters value={filter} onChange={setFilter} />
              <label className="kcd-field">
                <span>Assignee</span>
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                >
                  <option value="">Anyone</option>
                  {(people ?? [])
                    .filter((person) => person.deletedAt == null)
                    .map((person) => (
                      <option key={person._id} value={person._id}>
                        {model.personLabel(person)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {loading ? null : (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              // A prep sheet is measured in steps, not tickets.
              {
                id: "m-steps",
                label: "Steps",
                n: sheetTotals.total,
                tone: "text-ink",
              },
              {
                id: "m-doing",
                label: "Doing",
                n: sheetTotals.doing,
                tone: "text-warn",
              },
              {
                id: "m-blocked",
                label: "Blocked",
                n: sheetTotals.blocked,
                tone: sheetTotals.blocked > 0 ? "text-danger" : "text-ink-3",
              },
              {
                id: "m-done",
                label: "Done",
                n: sheetTotals.done,
                tone: "text-ok",
              },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  document
                    .getElementById(c.id)
                    ?.scrollIntoView({ block: "start" })
                }
                className="flex h-16 flex-col items-start justify-center rounded-sm bg-inset px-3"
              >
                <span className={`font-mono text-xl leading-none ${c.tone}`}>
                  {c.n}
                </span>
                <span className="mt-1 text-sm text-ink-2">{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-6">
            <TableSkeleton rows={6} />
          </div>
        ) : horizonEvents.length === 0 ? (
          <div className="mt-8">
            <h2 className="font-display text-2xl text-ink">
              No service in this window.
            </h2>
            <p className="mt-2 text-base text-ink-2">
              Nothing is booked between {formatDate(horizon.start().getTime())}{" "}
              and {formatDate(horizon.start().getTime() + 6 * 86_400_000)}.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-4 w-full justify-center"
              onClick={() => setHorizonOffset((v) => v + 7)}
            >
              Next 7 days
            </button>
            <Link
              to={eventsIndexPath()}
              className="btn btn-ghost mt-3 w-full justify-center"
            >
              Open the events book
            </Link>
          </div>
        ) : (
          <>
            {/* The printed prep sheet, on a phone: category, then item with
                its portion basis, then the steps — quantity on the left,
                instruction reading across. Same shape as work/list3.jpg. */}
            {prepSheet.length === 0 ? (
              <p className="mt-7 text-base text-ink-2">
                No prep matches this view.
              </p>
            ) : (
              prepSheet.map((group) => (
                <section key={group.category} className="mt-7">
                  <div className="section-rule">
                    <span>{group.category}</span>
                    <i />
                    <em>
                      {group.doneSteps}/{group.totalSteps}
                    </em>
                  </div>

                  {group.items.map((item) => (
                    <div key={item.key} className="mt-4">
                      <div className="flex items-baseline justify-between gap-3 border-b border-line-2 pb-1.5">
                        <h3 className="font-display text-xl leading-snug text-ink">
                          {item.name}
                        </h3>
                        {item.portionBasis ? (
                          <span className="font-mono shrink-0 text-sm text-ink-2">
                            {item.portionBasis}
                          </span>
                        ) : null}
                      </div>

                      {item.steps.map((row) => {
                        const status = String(row.task.status);
                        const done = status === "completed";
                        const blocked = status === "blocked";
                        const action = nextAction(row);
                        const busyHere =
                          busy === `claim:${row.task._id}` ||
                          busy === `start:${row.task._id}` ||
                          busy === `complete:${row.task._id}` ||
                          busy === `assign:${row.task._id}`;
                        const owner = row.task.assignedToId
                          ? model.personLabel(
                              model.findPerson(String(row.task.assignedToId)),
                            )
                          : null;
                        return (
                          <button
                            key={String(row.task._id)}
                            type="button"
                            disabled={busyHere || !action}
                            onClick={() => action?.run()}
                            className="flex w-full items-start gap-3 border-b border-line py-3 text-left disabled:cursor-default"
                          >
                            {/* Hand-ticked on paper; tapped here. */}
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                                done
                                  ? "border-ok bg-ok text-white"
                                  : blocked
                                    ? "border-danger text-danger"
                                    : "border-line-2 text-ink-3"
                              }`}
                            >
                              {done ? "✓" : blocked ? "!" : ""}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-mono shrink-0 text-base text-ink">
                                  {row.task.quantity != null
                                    ? `${row.task.quantity} ${row.task.unit ?? ""}`.trim()
                                    : "—"}
                                </span>
                                <span
                                  className={`text-base ${
                                    done
                                      ? "text-ink-3 line-through"
                                      : "text-ink"
                                  }`}
                                >
                                  {stepText(row.task.name, item.name)}
                                </span>
                              </span>
                              {row.task.specialInstructions ? (
                                <span className="mt-0.5 block text-sm text-ink-2">
                                  {String(row.task.specialInstructions)}
                                </span>
                              ) : null}
                              {blocked ? (
                                <span className="mt-0.5 block text-sm text-danger">
                                  {String(
                                    (
                                      row.task as {
                                        blockReason?: string | null;
                                      }
                                    ).blockReason ?? "Blocked",
                                  )}
                                </span>
                              ) : null}
                              {owner || action ? (
                                <span className="mt-1 flex flex-wrap items-baseline gap-x-3">
                                  {owner ? (
                                    <span className="text-sm text-ink-2">
                                      {owner}
                                    </span>
                                  ) : null}
                                  {action ? (
                                    <span className="text-sm font-semibold text-brand">
                                      {busyHere ? "Working…" : action.label}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </section>
              ))
            )}
          </>
        )}
        {/* The bottom tab bar floats over the sheet; keep the last row clear. */}
        <div className="h-24" aria-hidden="true" />
      </div>

      <div className="max-md:hidden">
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="display-title text-ink">Kitchen</h1>
            <div className="fact-row mt-3">
              <span className="fact">
                <b>Window:</b>
                {formatDate(horizon.start().getTime())} + 7 days
              </span>
              <span className="fact">
                <b>Services:</b>
                {horizonEvents.length}
              </span>
              <span className="fact">
                <b>Prep open:</b>
                {openTotal}
              </span>
              <span className="fact">
                <b>Blocked:</b>
                <span
                  className={blockedTotal > 0 ? "font-medium text-danger" : ""}
                >
                  {blockedTotal}
                </span>
              </span>
            </div>
          </div>
          <Link to="/kitchen/yield" className="btn btn-ghost">
            Yield variance
          </Link>
        </div>

        {/* One ruled toolbar: window, status, event, assignee. */}
        <div className="mt-6 border-y border-line">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex h-11 w-full cursor-pointer items-center justify-between text-sm font-semibold tracking-[0.09em] text-ink uppercase md:hidden"
          >
            Filters
            <span className="text-ink-2 font-normal tracking-normal normal-case">
              {horizonOffset === 0
                ? "From today"
                : formatDate(horizon.start().getTime())}
              {filter !== "all" ? ` · ${filter}` : ""}
            </span>
          </button>
          <div
            className={`flex-wrap items-center gap-x-5 gap-y-3 py-3 max-md:pb-4 md:flex ${
              filtersOpen ? "flex" : "hidden"
            }`}
          >
            <fieldset className="kcd-horizon-nav">
              <legend>Window</legend>
              <button
                type="button"
                onClick={() => setHorizonOffset((v) => v - 7)}
              >
                Earlier
              </button>
              <button
                type="button"
                data-active={horizonOffset === 0 ? "true" : "false"}
                onClick={() => setHorizonOffset(0)}
              >
                From today
              </button>
              <button
                type="button"
                onClick={() => setHorizonOffset((v) => v + 7)}
              >
                Later
              </button>
              <BoundedDateInput
                aria-label="Jump to date"
                title="Jump to date"
                value={horizon.startDateValue()}
                onChange={(e) => {
                  const offset = KitchenCommandDeckHorizon.offsetForDateValue(
                    e.target.value,
                  );
                  if (offset != null) setHorizonOffset(offset);
                }}
              />
            </fieldset>
            <KitchenCommandDeckFilters value={filter} onChange={setFilter} />
            <label className="kcd-field">
              <span>Event</span>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                aria-label="Filter by event"
              >
                <option value="">Every service</option>
                {horizonEvents.map((e) => (
                  <option key={e._id} value={e._id}>
                    {String(e.title)}
                  </option>
                ))}
              </select>
            </label>
            <label className="kcd-field">
              <span>Assignee</span>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="">Anyone</option>
                {(people ?? [])
                  .filter((person) => person.deletedAt == null)
                  .map((person) => (
                    <option key={person._id} value={person._id}>
                      {model.personLabel(person)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>

        {failure ? (
          <div className="mt-4">
            <CulinaryFailureBanner error={failure} />
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6">
            <TableSkeleton rows={8} />
          </div>
        ) : horizonEvents.length === 0 ? (
          <div className="mt-10 max-w-prose">
            <h2 className="font-display text-3xl text-ink">
              No service in this window.
            </h2>
            <p className="mt-2 text-base text-ink-2">
              Nothing is booked between {formatDate(horizon.start().getTime())}{" "}
              and {formatDate(horizon.start().getTime() + 6 * 86_400_000)}. Move
              the window, or open the events book to see what is coming.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setHorizonOffset((v) => v + 7)}
              >
                Next 7 days
              </button>
              <Link to={eventsIndexPath()} className="btn btn-ghost">
                Open the events book
              </Link>
            </div>
          </div>
        ) : (
          // Split workbench: the ledger reads left, the selected service works
          // right — Galley's two-pane treatment, the active pane marked.
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_368px] gap-x-9 max-lg:grid-cols-1">
            <div>
              {sections.map((section) =>
                section.rows.length === 0 ? null : (
                  <section key={section.id} className="mt-7">
                    <div className="section-rule">
                      <span>{section.label}</span>
                      <i />
                      {armedPersonId &&
                      model.assignableTasks(section.rows.map((r) => r.task))
                        .length > 0 ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            onAssignDish(
                              model.assignableTasks(
                                section.rows.map((r) => r.task),
                              ),
                            )
                          }
                        >
                          Assign{" "}
                          {
                            model.assignableTasks(
                              section.rows.map((r) => r.task),
                            ).length
                          }{" "}
                          to{" "}
                          {model.personLabel(model.findPerson(armedPersonId))}
                        </button>
                      ) : null}
                      <em>{section.rows.length}</em>
                    </div>
                    {section.rows.map(ledgerRow)}
                  </section>
                ),
              )}
              {horizonTasks.length === 0 ? (
                <div className="mt-8 max-w-prose">
                  <h2 className="font-display text-2xl text-ink">
                    No prep matches this view.
                  </h2>
                  <p className="mt-2 text-base text-ink-2">
                    {model.filterIsActive(filter, assigneeFilter)
                      ? "Clear the status or assignee filter to see the rest of the board."
                      : "These services have menus but no prep yet. Sync prep on the right to build the steps from the event menu."}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="max-lg:mt-8">
              <div className="sticky top-2 rounded-md border-2 border-accent bg-panel p-5">
                {selectedEvent ? (
                  <>
                    <div className="font-display text-2xl leading-tight text-ink">
                      {String(selectedEvent.title)}
                    </div>
                    <div className="fact-row mt-3 gap-x-5">
                      <span className="fact">
                        <b>Service:</b>
                        {formatDate(Number(selectedEvent.startsAt))}
                      </span>
                      <span className="fact">
                        <b>Covers:</b>
                        {String(selectedEvent.expectedHeadcount ?? "—")}
                      </span>
                    </div>
                    <div className="fact-row mt-2 gap-x-5">
                      <span className="fact">
                        <b>Prep:</b>
                        {model.progress(selectedEvent._id).completed}/
                        {model.progress(selectedEvent._id).total} done
                      </span>
                      <span className="fact">
                        <b>Venue:</b>
                        {venues?.find((v) => v._id === selectedEvent.venueId)
                          ?.name ?? "No venue"}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          !prepSyncReady || busy === `sync:${selectedEvent._id}`
                        }
                        onClick={onSyncPrep}
                      >
                        {busy === `sync:${selectedEvent._id}`
                          ? "Syncing…"
                          : "Sync prep"}
                      </button>
                      <Link
                        to={eventMenuRedirectPath(selectedEvent._id)}
                        className="btn btn-ghost btn-sm"
                      >
                        Event menu
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedEventId("")}
                      >
                        Every service
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-display text-2xl leading-tight text-ink">
                      Every service in the window
                    </div>
                    <p className="mt-2 text-base text-ink-2">
                      Pick a service from the toolbar or a row to work it on its
                      own.
                    </p>
                  </>
                )}

                <div className="section-rule mt-6">
                  <span>Crew</span>
                  <i />
                  <em>{assignableInView} assignable</em>
                </div>
                {crewRows.length === 0 ? (
                  <p className="mt-3 text-base text-ink-2">
                    Nobody holds prep in this window. Arm a cook, then assign.
                  </p>
                ) : (
                  <div className="mt-1">
                    {crewRows.map((crew) => {
                      const id = String(crew.person._id);
                      const armed = armedPersonId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={armed}
                          onClick={() => setArmedPersonId(armed ? null : id)}
                          className={`flex w-full cursor-pointer items-baseline justify-between gap-3 border-t border-line py-3 text-left ${
                            armed ? "text-brand" : "hover:bg-inset"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-base text-ink">
                              {model.personLabel(crew.person)}
                            </span>
                            <span className="block text-sm text-ink-2">
                              {crew.inProgress} doing · {crew.claimed} claimed ·{" "}
                              {crew.completed} done
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-ink-2">
                            {armed ? "Armed" : `${crew.load} open`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      {toast ? <output className="kcd-toast">{toast}</output> : null}
    </div>
  );
}
