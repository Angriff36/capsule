import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../../lib/format";
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
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { KitchenBookNav } from "./KitchenBookNav";
import { KitchenCommandDeckCrewRail } from "./command-deck/KitchenCommandDeckCrewRail";
import { KitchenCommandDeckEventRail } from "./command-deck/KitchenCommandDeckEventRail";
import { KitchenCommandDeckFilters } from "./command-deck/KitchenCommandDeckFilters";
import { KitchenCommandDeckHorizon } from "./command-deck/KitchenCommandDeckHorizon";
import { KitchenCommandDeckModel } from "./command-deck/KitchenCommandDeckModel";
import { KitchenCommandDeckTaskPanel } from "./command-deck/KitchenCommandDeckTaskPanel";
import type {
  CommandDeckFilter,
  PrepTaskLike,
} from "./command-deck/KitchenCommandDeckTypes";
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
      showToast("Arm a cook on the right first");
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
      showToast(`${count} tasks → ${label}`);
    });
  };

  return (
    <div className="culinary-document culinary-document-compact culinary-studio kitchen-command-deck space-y-4">
      <KitchenBookNav />
      <header className="kcd-masthead">
        <p className="eyebrow">Kitchen</p>
        <h1>Command deck</h1>
        <p className="kcd-lede">
          Next 7 days from {formatDate(horizon.start().getTime())} — put cooks
          on dishes and steps, and keep an eye on who is buried.
        </p>
      </header>

      <div className="kcd-toolbar">
        <fieldset className="kcd-horizon-nav">
          <legend>Horizon</legend>
          <button type="button" onClick={() => setHorizonOffset((v) => v - 7)}>
            Earlier
          </button>
          <button
            type="button"
            data-active={horizonOffset === 0 ? "true" : "false"}
            onClick={() => setHorizonOffset(0)}
          >
            From today
          </button>
          <button type="button" onClick={() => setHorizonOffset((v) => v + 7)}>
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
        <Link to="/kitchen/yield" className="btn btn-ghost ml-auto">
          Yield variance
        </Link>
      </div>

      {failure ? <CulinaryFailureBanner error={failure} /> : null}
      {loading ? <TableSkeleton rows={8} /> : null}

      {loading ? null : (
        <div className="kcd-board">
          <aside className="kcd-rail" aria-label="Events in horizon">
            <h2 className="kcd-rail-title">This horizon</h2>
            <KitchenCommandDeckEventRail
              model={model}
              events={horizonEvents}
              selectedEventId={selectedEventId}
              onSelect={setSelectedEventId}
              venueName={(id) =>
                venues?.find((v) => v._id === id)?.name ?? "No venue"
              }
            />
          </aside>

          <main className="kcd-stage">
            <KitchenCommandDeckTaskPanel
              model={model}
              event={selectedEvent}
              filter={filter}
              assigneeFilter={assigneeFilter}
              armedPersonId={armedPersonId}
              busy={busy}
              prepSyncReady={prepSyncReady}
              componentName={(id) =>
                id
                  ? (components?.find((r) => r._id === id)?.name ?? null)
                  : null
              }
              onAssignTask={onAssignTask}
              onAssignDish={onAssignDish}
              onRelease={(task) =>
                void run(
                  `release:${task._id}`,
                  () => actions.releaseOne(task),
                  "Released",
                )
              }
              onClaim={(task) => {
                // PrepTask.claim writes user.personId into a Person FK, so it
                // fails outright for a sign-in with no staff profile. Say that
                // instead of surfacing a bare "Action failed unexpectedly".
                if (!authStatus?.personId) {
                  setFailure(
                    new Error(
                      "Your sign-in isn't linked to a staff profile yet, so it can't hold prep work. Ask an admin to link it under Administration → Team roles — or use Assign to put a cook on this step.",
                    ),
                  );
                  return;
                }
                void run(
                  `claim:${task._id}`,
                  () => actions.claimOne(task),
                  "Claimed",
                );
              }}
              onStart={(task) =>
                void run(
                  `start:${task._id}`,
                  () => actions.startOne(task),
                  "Started",
                )
              }
              onComplete={(task) =>
                void run(
                  `complete:${task._id}`,
                  () => actions.completeOne(task),
                  "Completed",
                )
              }
              onSyncPrep={() => {
                if (!selectedEvent) return;
                void run(
                  `sync:${selectedEvent._id}`,
                  async () => {
                    const rows = model.selections(selectedEvent._id);
                    for (const row of rows) {
                      await syncPrepForDish({
                        id: row._id,
                        eventId: selectedEvent._id,
                        dishId: row.dishId,
                        quantityServings: Number(row.quantityServings) || 1,
                      });
                    }
                  },
                  "Prep synced from dish templates",
                );
              }}
            />
          </main>

          <aside className="kcd-rail" aria-label="Crew load">
            <KitchenCommandDeckCrewRail
              model={model}
              rows={crewRows}
              people={people ?? []}
              armedPersonId={armedPersonId}
              onArm={setArmedPersonId}
            />
          </aside>
        </div>
      )}

      {toast ? <output className="kcd-toast">{toast}</output> : null}
    </div>
  );
}
