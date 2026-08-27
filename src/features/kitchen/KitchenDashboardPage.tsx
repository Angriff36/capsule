import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  useListDish,
  useListEvent,
  useListEventDish,
  useListPerson,
  useListInvoice,
  useListPrepTask,
  useListComponent,
  useListVenue,
  usePrepTaskAssign,
  usePrepTaskCancel,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskRelease,
  usePrepTaskRevise,
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

/** prepTasks.unit is a closed enum in convex/schema.ts; offer exactly it. */
const PREP_UNITS = [
  "each",
  "portion",
  "serving",
  "batch",
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
  "melon",
  "bottle",
] as const;
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
  const invoices = useListInvoice();
  const people = useListPerson();
  const venues = useListVenue();
  const authStatus = useAuthStatus();

  const assign = usePrepTaskAssign();
  const claim = usePrepTaskClaim();
  const release = usePrepTaskRelease();
  const start = usePrepTaskStart();
  const revise = usePrepTaskRevise();
  const cancel = usePrepTaskCancel();
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
  const [editing, setEditing] = useState<string | null>(null);
  /** Columns are services by default; combining switches to cooks so the
   *  handed-out job reads back as one column. */
  const [boardBy, setBoardBy] = useState<"service" | "cook">("service");
  /** Ticked rows. The board works in batches — one cook, many steps. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
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
    // The board opens on every service in the window. It used to open on the
    // first event, which read as a filter nobody set — and re-picking that
    // event whenever the id went empty made "Every service" unselectable.
    // Only drop a selection that has left the window; never invent one.
    if (
      selectedEventId &&
      horizonEvents.length > 0 &&
      !horizonEvents.some((e) => e._id === selectedEventId)
    ) {
      setSelectedEventId("");
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
  /** Hand a claim back to the shared pool. An accidental or abandoned claim
   *  used to be unreachable from the board. */
  const onReleaseTask = (task: PrepTaskLike) =>
    void run(
      `release:${task._id}`,
      () => actions.releaseOne(task),
      "Returned to the pool",
    );
  const onCompleteTask = (task: PrepTaskLike) =>
    void run(
      `complete:${task._id}`,
      () => actions.completeOne(task),
      "Completed",
    );

  const onSyncPrep = () => {
    if (!selectedEvent) return;
    onSyncPrepFor(String(selectedEvent._id));
  };

  /** Build prep for one service from its event menu. */
  const onSyncPrepFor = (eventId: string) => {
    void run(
      `sync:${eventId}`,
      async () => {
        const rows = model.selections(eventId);
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
            eventId,
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

  /** The kitchen identifies a job by its invoice number, as the printed
   *  sheets do ("Invoice #: 5792"). Shown only where one exists — Events
   *  themselves carry no number, and inventing one would be a lie. */
  const invoiceNumberFor = (eventId: unknown) =>
    (invoices ?? []).find(
      (i) => i.deletedAt == null && String(i.eventId) === String(eventId),
    )?.invoiceNumber ?? null;

  /** A live step can be re-measured: the head count changes, the delivery is
   *  short, the cook is already on it. PrepTask.revise accepts pending,
   *  claimed, in-progress and blocked (task.manifest). A finished or
   *  cancelled step is closed — yield variance reads completedQuantity
   *  against quantity, so rewriting the amount after the fact would falsify
   *  the record, not correct it. */
  const canRevise = (task: PrepTaskLike) =>
    ["pending", "claimed", "in_progress", "blocked"].includes(
      String(task.status),
    );

  const reviseBlocked = (task: PrepTaskLike) => {
    const status = String(task.status);
    if (status === "completed")
      return "This step is done. Its amount is what the yield was measured against.";
    if (status === "cancelled") return "This step was cancelled.";
    return "This step cannot be re-measured.";
  };

  /** Change a step's quantity or unit in place, through PrepTask.revise. */
  const onRevise = (task: PrepTaskLike, quantity: number, unit: string) =>
    void run(
      `revise:${task._id}`,
      async () => {
        if (!canRevise(task)) throw new Error(reviseBlocked(task));
        await revise({
          docId: task._id,
          version: task.version,
          quantity,
          unit,
        });
        setEditing(null);
      },
      "Quantity updated",
    );

  /** Clock only. The day is stated once, by the service, not on every step. */
  const serviceTime = (startsAt: unknown) => {
    const ms = Number(startsAt);
    if (!Number.isFinite(ms) || ms === 0) return "time to confirm";
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  /** One next action per row, using the handlers already wired above. */
  /** The quiet action that sits beside the primary one, where there is a
   *  sensible second move. Today that is only Release on a claimed step. */
  const secondAction = (row: LedgerRow) =>
    String(row.task.status) === "claimed"
      ? { label: "Release", run: () => onReleaseTask(row.task) }
      : null;

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

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickedRows = horizonTasks.filter((r) => picked.has(String(r.task._id)));

  /** Everything ticked, in board order, whatever section it sits in. */
  /** Which of the ticked steps a bulk verb can actually act on. Checked
   *  BEFORE anything is written: running the verb row by row and letting the
   *  backend reject a later one left the earlier ones committed, so a failed
   *  bulk action was half applied. */
  const bulkTargets = (label: string) =>
    pickedRows.filter((r) => {
      const status = String(r.task.status);
      if (label === "claim") return status === "pending";
      if (label === "start") return status === "claimed";
      if (label === "complete") return status === "in_progress";
      return false;
    });

  const onPickedBulk = (
    label: string,
    verb: (task: PrepTaskLike) => Promise<void>,
    done: string,
  ) => {
    const targets = bulkTargets(label);
    const skipped = pickedRows.length - targets.length;
    if (targets.length === 0) {
      setFailure(
        new Error(
          `None of the ${formatCountNoun(pickedRows.length, "step")} selected can be ${done} from where they are.`,
        ),
      );
      return;
    }
    void run(`bulk:${label}`, async () => {
      for (const row of targets) await verb(row.task);
      setPicked(new Set());
      showToast(
        `${formatCountNoun(targets.length, "step")} ${done}` +
          (skipped > 0 ? ` · ${skipped} skipped` : ""),
      );
    });
  };

  const onBulkAssign = () => {
    const personId = requireArmed();
    if (!personId) return;
    const label = model.personLabel(model.findPerson(personId));
    void run("bulk:assign", async () => {
      const count = await actions.assignMany(
        pickedRows.map((r) => r.task),
        personId,
      );
      setPicked(new Set());
      showToast(`${formatCountNoun(count, "task")} → ${label}`);
    });
  };

  /** Round the way a kitchen writes a quantity: 7.81, not 7.8100000001. */
  const qty = (n: number) =>
    Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));

  /** Totals per unit. Steps from different events, dishes and measurements
   *  combine fine — you just cannot add pounds to each, so each unit gets
   *  its own subtotal. Finished work is not counted as work left. */
  const unitTotals = (rows: LedgerRow[]) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const status = String(row.task.status);
      if (status === "completed" || status === "cancelled") continue;
      const unit = String(row.task.unit ?? "each");
      totals.set(
        unit,
        (totals.get(unit) ?? 0) + (Number(row.task.quantity) || 0),
      );
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([unit, total]) => `${qty(total)} ${unit}`)
      .join(" · ");
  };
  /** Live work changes hands; closed work does not. Combine says which steps
   *  stayed behind rather than dropping them in silence. */
  const movable = (rows: LedgerRow[]) =>
    rows.filter((r) => KitchenPrepAssignManager.canAssign(r.task));

  const stuckReason = (rows: LedgerRow[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (KitchenPrepAssignManager.canAssign(row.task)) continue;
      const status = String(row.task.status);
      const label = status === "completed" ? "already done" : status;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, n]) => `${n} ${label}`)
      .join(", ");
  };

  /** Combine = one cook takes all of it as one job. Nothing is cancelled and
   *  nothing is rewritten: every step still gets done, and every step keeps
   *  its own event, dish, quantity and unit. Combining is how work is handed
   *  out, so it spans services, dishes and measurements on purpose — each
   *  unit simply keeps its own subtotal. Assignment is the grouping: the
   *  Cooks view then reads the combined job back as one column. */
  const onCombine = () => {
    const personId = requireArmed();
    if (!personId) return;
    if (pickedRows.length < 2) {
      setFailure(
        new Error("Tick two or more steps to combine them into one job."),
      );
      return;
    }
    const targets = movable(pickedRows);
    const stuck = stuckReason(pickedRows);
    const label = model.personLabel(model.findPerson(personId));
    if (targets.length === 0) {
      setFailure(
        new Error(
          `None of these steps can change hands (${stuck}). Finished and cancelled work stays where it is.`,
        ),
      );
      return;
    }
    const totals = unitTotals(targets);
    void run("bulk:combine", async () => {
      const count = await actions.assignMany(
        targets.map((r) => r.task),
        personId,
      );
      setPicked(new Set());
      // Show it back as one job: the cook's column now holds all of it. Do
      // not narrow the board to that cook — the rest of the week still has
      // to be visible while work is handed out.
      setBoardBy("cook");
      showToast(
        `${formatCountNoun(count, "step")} combined for ${label} — ${totals}` +
          (stuck ? ` · ${stuck} stayed put` : ""),
      );
    });
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
        return sentenceCase(cut.slice(0, -1).join(" — ").trim());
      }
    }
    return sentenceCase(text);
  };

  // -- The week board ---------------------------------------------------
  // One column per service (or per cook), each column a prep sheet: category,
  // then the dish with its portion basis, then that dish's own steps. A whole
  // week stands side by side, so nothing needs switching and nothing needs a
  // mile of scrolling - each column scrolls on its own.
  const boardColumns = useMemo(() => {
    const dishName = (id: unknown) =>
      dishes?.find((d) => d._id === String(id))?.name ?? null;
    const servingsFor = (row: LedgerRow) =>
      eventDishes?.find((ed) => ed._id === String(row.task.eventDishId))
        ?.quantityServings;

    /** Category then dish then steps, in printed-sheet order. */
    const sheet = (rows: LedgerRow[]) => {
      const byCategory = new Map<string, Map<string, LedgerRow[]>>();
      for (const row of rows) {
        const category = String(row.task.category ?? "Other");
        const key = String(
          row.task.eventDishId ?? row.task.dishId ?? row.task._id,
        );
        let dishesIn = byCategory.get(category);
        if (!dishesIn) byCategory.set(category, (dishesIn = new Map()));
        const steps = dishesIn.get(key);
        if (steps) steps.push(row);
        else dishesIn.set(key, [row]);
      }
      const rank = (c: string) => {
        const i = SHEET_ORDER.indexOf(c);
        return i < 0 ? SHEET_ORDER.length : i;
      };
      return [...byCategory.entries()]
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
        .map(([category, dishesIn]) => ({
          category,
          dishes: [...dishesIn.entries()].map(([key, steps]) => {
            const first = steps[0]!;
            const servings = servingsFor(first);
            return {
              key,
              name: (
                dishName(first.task.dishId) ??
                String(first.task.name).split("—")[0] ??
                "Item"
              )
                .trim()
                .toUpperCase(),
              portionBasis:
                servings != null ? `P: ${Number(servings)} Serving` : null,
              event: first.event,
              steps,
            };
          }),
        }));
    };

    const columns: {
      id: string;
      title: string;
      meta: string;
      rows: LedgerRow[];
      groups: ReturnType<typeof sheet>;
    }[] = [];

    if (boardBy === "cook") {
      const byPerson = new Map<string, LedgerRow[]>();
      for (const row of horizonTasks) {
        const key = String(row.task.assignedToId ?? "");
        const held = byPerson.get(key);
        if (held) held.push(row);
        else byPerson.set(key, [row]);
      }
      const entries = [...byPerson.entries()].sort((a, b) => {
        if (a[0] === "") return -1;
        if (b[0] === "") return 1;
        return b[1].length - a[1].length;
      });
      for (const [personId, rows] of entries) {
        columns.push({
          id: personId || "unassigned",
          title: personId
            ? model.personLabel(model.findPerson(personId))
            : "Nobody yet",
          meta: personId
            ? `${formatCountNoun(rows.length, "step")} in hand`
            : `${formatCountNoun(rows.length, "step")} to hand out`,
          rows,
          groups: sheet(rows),
        });
      }
      return columns;
    }

    for (const event of horizonEvents) {
      const rows = horizonTasks.filter((r) => r.event._id === event._id);
      const number = invoiceNumberFor(event._id);
      columns.push({
        id: String(event._id),
        title: String(event.title),
        meta: `${formatDate(Number(event.startsAt))} · ${serviceTime(
          event.startsAt,
        )}${number ? ` · Invoice #${number}` : ""}`,
        rows,
        groups: sheet(rows),
      });
    }
    return columns;
  }, [
    boardBy,
    horizonTasks,
    horizonEvents,
    dishes,
    eventDishes,
    model,
    invoices,
  ]);

  const tickAll = (rows: LedgerRow[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        const id = String(row.task._id);
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  /** One step inside a dish block. Narrow enough for a column, and still
   *  showing the whole instruction - a half-printed step is not a step. */
  const boardStep = (row: LedgerRow, itemName: string) => {
    const id = String(row.task._id);
    const status = String(row.task.status);
    const done = status === "completed";
    const blocked = status === "blocked";
    const action = nextAction(row);
    const second = secondAction(row);
    const busyHere =
      busy === `claim:${id}` ||
      busy === `start:${id}` ||
      busy === `complete:${id}` ||
      busy === `assign:${id}`;
    const owner = row.task.assignedToId
      ? model.personLabel(model.findPerson(String(row.task.assignedToId)))
      : null;
    return (
      <div
        key={id}
        className="flex items-start gap-2.5 border-b border-line py-2.5"
      >
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
          checked={picked.has(id)}
          onChange={() => togglePicked(id)}
          aria-label={`Select ${String(row.task.name)}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {editing === id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const next = Number(data.get("q"));
                  if (Number.isFinite(next) && next > 0) {
                    onRevise(row.task, next, String(data.get("u") ?? ""));
                  }
                }}
                className="flex items-center gap-1"
              >
                <input
                  name="q"
                  type="number"
                  step="any"
                  defaultValue={String(row.task.quantity ?? "")}
                  aria-label="Quantity"
                  className="input h-8 w-16 px-1.5"
                />
                <select
                  name="u"
                  defaultValue={String(row.task.unit ?? "each")}
                  aria-label="Unit"
                  className="input h-8 w-24 px-1"
                >
                  {PREP_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Save
                </button>
              </form>
            ) : canRevise(row.task) ? (
              <button
                type="button"
                onClick={() => setEditing(id)}
                title="Change the amount"
                className="font-mono shrink-0 cursor-pointer text-base whitespace-nowrap text-ink underline decoration-line-2 underline-offset-4"
              >
                {row.task.quantity != null
                  ? `${qty(Number(row.task.quantity))} ${row.task.unit ?? ""}`.trim()
                  : "—"}
              </button>
            ) : (
              <span
                title={reviseBlocked(row.task)}
                className={`font-mono shrink-0 text-base whitespace-nowrap ${
                  done ? "text-ink-3" : "text-ink"
                }`}
              >
                {row.task.quantity != null
                  ? `${qty(Number(row.task.quantity))} ${row.task.unit ?? ""}`.trim()
                  : "—"}
              </span>
            )}
            <span
              className={`text-base ${done ? "text-ink-3 line-through" : "text-ink"}`}
            >
              {stepText(row.task.name, itemName)}
            </span>
          </div>
          {row.task.specialInstructions ? (
            <p className="mt-0.5 text-sm text-ink-2">
              {String(row.task.specialInstructions)}
            </p>
          ) : null}
          {blocked ? (
            <p className="mt-0.5 text-sm text-danger">
              {String(
                (row.task as { blockReason?: string | null }).blockReason ??
                  "Blocked",
              )}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            {boardBy === "service" && owner ? (
              <span className="text-sm text-ink-2">{owner}</span>
            ) : null}
            {boardBy === "cook" ? (
              <span className="text-sm text-ink-2">
                {String(row.event.title)}
              </span>
            ) : null}
            {action ? (
              <button
                type="button"
                disabled={busyHere}
                onClick={action.run}
                className="cursor-pointer text-sm font-semibold text-brand"
              >
                {busyHere ? "Working…" : action.label}
              </button>
            ) : null}
            {second ? (
              <button
                type="button"
                disabled={busy === `release:${id}`}
                onClick={second.run}
                className="cursor-pointer text-sm text-ink-2 underline underline-offset-4"
              >
                {busy === `release:${id}` ? "Working…" : second.label}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
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
              <div className="mt-7">
                <p className="text-base text-ink-2">
                  No prep matches this view.
                </p>
                {/* Building prep used to be desktop-only, so a phone facing an
                    event with a menu and no steps had no way forward. */}
                {selectedEvent ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      type="button"
                      className="btn btn-primary h-12 w-full justify-center"
                      disabled={
                        !prepSyncReady || busy === `sync:${selectedEvent._id}`
                      }
                      onClick={onSyncPrep}
                    >
                      {busy === `sync:${selectedEvent._id}`
                        ? "Syncing…"
                        : "Sync prep from the menu"}
                    </button>
                    <Link
                      to={eventMenuRedirectPath(selectedEvent._id)}
                      className="btn btn-ghost h-12 w-full justify-center"
                    >
                      Event menu
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-base text-ink-2">
                    Pick one service above to build its prep from the menu.
                  </p>
                )}
              </div>
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
                      {/* Which job this item belongs to, stated once per item
                          — the same "Invoice #" the printed sheet carries. */}
                      {item.steps[0] ? (
                        <div className="mt-1 text-sm text-ink-2">
                          {String(item.steps[0].event.title)}
                          {invoiceNumberFor(item.steps[0].event._id)
                            ? ` #${invoiceNumberFor(item.steps[0].event._id)}`
                            : ""}{" "}
                          · {serviceTime(item.steps[0].event.startsAt)}
                        </div>
                      ) : null}

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
            <fieldset className="kcd-horizon-nav">
              <legend>Board by</legend>
              <button
                type="button"
                data-active={boardBy === "service" ? "true" : "false"}
                onClick={() => setBoardBy("service")}
              >
                Services
              </button>
              <button
                type="button"
                data-active={boardBy === "cook" ? "true" : "false"}
                onClick={() => setBoardBy("cook")}
              >
                Cooks
              </button>
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
              <span>Arm cook</span>
              <select
                value={armedPersonId ?? ""}
                onChange={(e) => setArmedPersonId(e.target.value || null)}
                aria-label="Arm a cook for assignment"
              >
                <option value="">Nobody armed</option>
                {crewRows.map((crew) => (
                  <option
                    key={String(crew.person._id)}
                    value={String(crew.person._id)}
                  >
                    {model.personLabel(crew.person)} ({crew.load} open)
                  </option>
                ))}
              </select>
            </label>
            {selectedEvent ? (
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
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
              </span>
            ) : null}
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
            {/* Arming a cook was desktop-only, so a phone could never hand
                work out. Same control, same state. */}
            <label className="kcd-field">
              <span>Arm cook</span>
              <select
                value={armedPersonId ?? ""}
                onChange={(e) => setArmedPersonId(e.target.value || null)}
                aria-label="Arm a cook for assignment"
              >
                <option value="">Nobody armed</option>
                {crewRows.map((crew) => (
                  <option
                    key={String(crew.person._id)}
                    value={String(crew.person._id)}
                  >
                    {model.personLabel(crew.person)} ({crew.load} open)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* What is ticked, and what can be done to all of it at once. */}
        {pickedRows.length > 0 ? (
          <div className="attention-band mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="text-base font-medium text-ink">
              {formatCountNoun(pickedRows.length, "step")} selected
            </span>
            <span className="font-mono text-base text-ink-2">
              {unitTotals(pickedRows) || "nothing left to do"}
            </span>
            {stuckReason(pickedRows) ? (
              <span className="text-sm text-ink-2">
                {stuckReason(pickedRows)} cannot change hands
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy === "bulk:combine"}
              title={
                armedPersonId
                  ? "Hand all of this to the armed cook as one job. Nothing is cancelled and nothing is rewritten."
                  : "Arm a cook in the toolbar first"
              }
              onClick={onCombine}
            >
              {armedPersonId
                ? `Combine for ${model.personLabel(model.findPerson(armedPersonId))}`
                : "Combine"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "bulk:assign"}
              onClick={onBulkAssign}
            >
              Assign
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "bulk:claim"}
              onClick={() =>
                onPickedBulk("claim", (t) => actions.claimOne(t), "claimed")
              }
            >
              Claim
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "bulk:start"}
              onClick={() =>
                onPickedBulk("start", (t) => actions.startOne(t), "started")
              }
            >
              Start
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === "bulk:complete"}
              onClick={() =>
                onPickedBulk(
                  "complete",
                  (t) => actions.completeOne(t),
                  "completed",
                )
              }
            >
              Complete
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </button>
          </div>
        ) : null}

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
        ) : boardColumns.length === 0 ? (
          <div className="mt-8 max-w-prose">
            <h2 className="font-display text-2xl text-ink">
              No prep matches this view.
            </h2>
            <p className="mt-2 text-base text-ink-2">
              {model.filterIsActive(filter, assigneeFilter)
                ? "Clear the status or assignee filter to see the rest of the board."
                : "These services have menus but no prep yet. Pick a service, then use Sync prep to build the steps from its menu."}
            </p>
          </div>
        ) : (
          // The board proper. It scrolls sideways through the week; each
          // column scrolls on its own, so no column can push the page down.
          <div className="kcd-week mt-5 flex gap-7 overflow-x-auto pb-4">
            {boardColumns.map((column) => {
              const allTicked =
                column.rows.length > 0 &&
                column.rows.every((r) => picked.has(String(r.task._id)));
              const blocked = column.rows.filter(
                (r) => String(r.task.status) === "blocked",
              ).length;
              const doneHere = column.rows.filter(
                (r) => String(r.task.status) === "completed",
              ).length;
              return (
                <section
                  key={column.id}
                  className="flex h-[calc(100vh-19rem)] max-h-[900px] min-h-[520px] w-[382px] shrink-0 flex-col"
                >
                  {/* Column head: whose sheet this is, and what is left on it. */}
                  <header className="border-t-2 border-ink pt-3">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-2xl leading-tight text-ink">
                        {column.title}
                      </h2>
                      <input
                        type="checkbox"
                        className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
                        checked={allTicked}
                        onChange={(e) => tickAll(column.rows, e.target.checked)}
                        aria-label={`Select every step on ${column.title}`}
                      />
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{column.meta}</p>
                    <p className="font-mono mt-1.5 text-base text-ink">
                      {unitTotals(column.rows) || "nothing left"}
                    </p>
                    <p className="mt-1 text-sm text-ink-2">
                      {doneHere}/{column.rows.length} done
                      {blocked > 0 ? (
                        <span className="font-medium text-danger">
                          {" "}
                          · {blocked} blocked
                        </span>
                      ) : null}
                    </p>
                  </header>

                  {/* The sheet: category, dish, then that dish's own steps. */}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                    {column.rows.length === 0 ? (
                      <div className="border-t border-line pt-3">
                        <p className="text-base text-ink-2">
                          No prep built for this service yet.
                        </p>
                        {boardBy === "service" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={
                                !prepSyncReady || busy === `sync:${column.id}`
                              }
                              onClick={() => onSyncPrepFor(column.id)}
                            >
                              {busy === `sync:${column.id}`
                                ? "Syncing…"
                                : "Sync prep from the menu"}
                            </button>
                            <Link
                              to={eventMenuRedirectPath(column.id)}
                              className="btn btn-ghost btn-sm"
                            >
                              Event menu
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {column.groups.map((group) => (
                      <div key={group.category} className="mt-4 first:mt-0">
                        <div className="section-rule">
                          <span>{group.category}</span>
                          <i />
                        </div>
                        {group.dishes.map((dish) => (
                          <article key={dish.key} className="mt-3">
                            <div className="flex items-baseline justify-between gap-2 border-b border-line-2 pb-1">
                              <h3 className="font-display text-lg leading-snug text-ink">
                                {sentenceCase(dish.name)}
                              </h3>
                              {dish.portionBasis ? (
                                <span className="font-mono shrink-0 text-sm text-ink-2">
                                  {dish.portionBasis}
                                </span>
                              ) : null}
                            </div>
                            {dish.steps.map((row) => boardStep(row, dish.name))}
                            {armedPersonId &&
                            model.assignableTasks(dish.steps.map((r) => r.task))
                              .length > 0 ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm mt-1.5"
                                onClick={() =>
                                  onAssignDish(
                                    model.assignableTasks(
                                      dish.steps.map((r) => r.task),
                                    ),
                                  )
                                }
                              >
                                Whole dish to{" "}
                                {model.personLabel(
                                  model.findPerson(armedPersonId),
                                )}
                              </button>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {toast ? <output className="kcd-toast">{toast}</output> : null}
    </div>
  );
}
