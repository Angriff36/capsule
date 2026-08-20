import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListDish,
  useListDishIngredient,
  useListEventDish,
  useListIngredient,
  useListPrepTask,
} from "../../lib/manifest-convex-react";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventTabIntro } from "./EventTabIntro";
import {
  suspectPrepQuantityFlag,
  suspectRowsFromRecipeLines,
} from "./eventMenuSuspectQuantity";

type Props = {
  eventId: string;
  eventStage: string;
};

export function EventPrepTab({ eventId, eventStage }: Props) {
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const dishIngredients = useListDishIngredient();
  const ingredients = useListIngredient();
  const prepTasks = useListPrepTask();
  const { ready, syncPrepForDish } = useEventMenuSync();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selections = useMemo(
    () =>
      (eventDishes ?? []).filter(
        (row) => row.deletedAt == null && row.eventId === eventId,
      ),
    [eventDishes, eventId],
  );
  const tasks = useMemo(
    () =>
      (prepTasks ?? []).filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === eventId &&
          row.status !== "cancelled",
      ),
    [eventId, prepTasks],
  );

  const dishName = (id: string) =>
    dishes?.find((row) => row._id === id)?.name ?? "Unknown dish";

  const sync = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (selections.length === 0) {
        setNotice("No dishes on this event yet, so prep has nothing to sync.");
        return;
      }
      const reasons: string[] = [];
      let created = 0;
      for (const row of selections) {
        const result = await syncPrepForDish({
          id: row._id,
          eventId,
          dishId: row.dishId,
          quantityServings: Number(row.quantityServings) || 1,
          specialInstructions: row.specialInstructions ?? undefined,
        });
        created += result.taskCount;
        if (result.noOpReason) {
          reasons.push(`${dishName(row.dishId)}: ${result.noOpReason}`);
        }
      }
      if (reasons.length > 0 && created === 0) {
        setNotice(reasons.join(" "));
      } else if (reasons.length > 0) {
        setNotice(
          `Synced ${created} prep step${created === 1 ? "" : "s"}. ${reasons.join(" ")}`,
        );
      } else {
        setNotice(
          `Prep list generated from the event menu (${created} step${created === 1 ? "" : "s"}).`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sync prep.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="event-prep-tab">
      <EventTabIntro
        title="Prep"
        description="Prep steps for this event's menu. Sync generates work from dish templates, or from recipe ingredients when a dish has no templates."
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !ready}
          onClick={() => void sync()}
        >
          {busy ? "Syncing…" : "Sync prep from menu"}
        </button>
        <Link className="btn btn-ghost" to="/kitchen/prep">
          Open command deck
        </Link>
      </div>
      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p
          className="text-base text-ink-2"
          role="status"
          data-testid="prep-sync-notice"
        >
          {notice}
        </p>
      ) : null}
      {tasks.length === 0 ? (
        <div className="document-empty">
          <p>
            No prep steps yet. Sync prep from the menu — dishes without
            templates still generate steps from their ingredients. If sync does
            nothing, it will say why.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li
              key={task._id}
              className="flex flex-wrap justify-between gap-2 py-2"
            >
              <div>
                <p className="font-medium">{task.name}</p>
                <p className="font-mono text-xs text-ink-3">
                  {task.quantity} {String(task.unit)} · {String(task.status)}
                  {task.dishId ? ` · ${dishName(String(task.dishId))}` : ""}
                </p>
                {(() => {
                  const selection = selections.find(
                    (row) =>
                      row._id === task.eventDishId ||
                      row.dishId === task.dishId,
                  );
                  const servings = Number(selection?.quantityServings ?? 0);
                  const dishId = String(task.dishId ?? selection?.dishId ?? "");
                  const recipeFlags = suspectRowsFromRecipeLines(
                    (dishIngredients ?? [])
                      .filter(
                        (line) =>
                          line.deletedAt == null && line.dishId === dishId,
                      )
                      .map((line) => ({
                        name:
                          ingredients?.find(
                            (row) => row._id === line.ingredientId,
                          )?.name ?? "",
                        unit: String(line.unit),
                        quantity: Number(line.quantity),
                        prepNotes:
                          (line as { prepNotes?: string | null }).prepNotes ??
                          null,
                      })),
                    servings,
                  );
                  const taskFlag = suspectPrepQuantityFlag({
                    name: task.name,
                    unit: String(task.unit),
                    quantity: Number(task.quantity),
                    servings,
                  });
                  const flags = [
                    ...recipeFlags.map((row) => row.flag),
                    ...(taskFlag ? [taskFlag] : []),
                  ].filter((flag, index, all) => all.indexOf(flag) === index);
                  return flags.map((flag) => (
                    <p
                      key={flag}
                      className="text-sm text-danger"
                      data-testid="suspect-prep-quantity"
                    >
                      {flag}
                    </p>
                  ));
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}
      <EventDraftPoButton eventId={eventId} eventStage={eventStage} />
    </section>
  );
}
