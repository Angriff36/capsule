import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListComponent,
  useListPerson,
  useListDish,
  useListDishIngredient,
  useListEventDish,
  useListIngredient,
  useListPrepTask,
} from "../../lib/manifest-convex-react";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventTabIntro } from "./EventTabIntro";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import { runBulkItems } from "../../ui/bulk-select";
import { suspectRowsFromRecipeLines } from "./eventMenuSuspectQuantity";

import { EventPrepList } from "./EventPrepList";
import { EventPrepWorkNotice } from "./EventPrepWorkNotice";

type Props = {
  eventId: string;
  eventStage: string;
};

export function EventPrepTab({ eventId, eventStage }: Props) {
  const eventDishes = useListEventDish();
  const dishes = useListDish();
  const components = useListComponent();
  const people = useListPerson();
  const dishIngredients = useListDishIngredient();
  const ingredients = useListIngredient();
  const prepTasks = useListPrepTask();
  const { ready, syncPrepForDish } = useEventMenuSync();
  const [busy, setBusy] = useState(false);
  const { notice, setNotice } = useActionNotice();
  const { error, setError } = useActionFailure();

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

  const recipeFlags = useMemo(() => {
    const ingredientNames = new Map(
      (ingredients ?? []).map((row) => [row._id, row.name]),
    );
    const linesByDish = new Map<string, NonNullable<typeof dishIngredients>>();
    for (const line of dishIngredients ?? []) {
      if (line.deletedAt != null) continue;
      const lines = linesByDish.get(line.dishId) ?? [];
      lines.push(line);
      linesByDish.set(line.dishId, lines);
    }
    return new Map(
      selections.map((selection) => [
        selection._id,
        [
          ...new Set(
            suspectRowsFromRecipeLines(
              (linesByDish.get(selection.dishId) ?? []).map((line) => ({
                name: ingredientNames.get(line.ingredientId) ?? "",
                unit: String(line.unit),
                quantity: Number(line.quantity),
                prepNotes: line.prepNotes,
              })),
              Number(selection.quantityServings),
            ).map((row) => row.flag),
          ),
        ],
      ]),
    );
  }, [selections, dishIngredients, ingredients]);

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
      await runBulkItems(selections, async (row) => {
        const result = await syncPrepForDish({
          id: row._id,
          eventId,
          dishId: row.dishId,
          quantityServings: Number(row.quantityServings),
          specialInstructions: row.specialInstructions ?? undefined,
        });
        created += result.taskCount;
        if (result.noOpReason) {
          reasons.push(`${dishName(row.dishId)}: ${result.noOpReason}`);
        }
      });
      if (reasons.length > 0 && created === 0) {
        setNotice(reasons.join(" "));
      } else if (reasons.length > 0) {
        setNotice(
          `Synced ${created} prep step${created === 1 ? "" : "s"}. ${reasons.join(" ")}`,
        );
      } else {
        setNotice(
          created > 0
            ? `Updated ${created} prep step${created === 1 ? "" : "s"} from the event menu.`
            : "Prep already matches the event menu.",
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
        description="Work by dish, with servings, quantities, instructions and linked recipes."
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
      {error ? (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="text-base text-ink-2"
          role="status"
          data-testid="prep-sync-notice"
        >
          {notice}
        </p>
      ) : null}
      <EventPrepWorkNotice eventId={eventId} />
      {eventDishes === undefined ||
      prepTasks === undefined ||
      dishes === undefined ? (
        <p className="text-base text-ink-2" role="status">
          Loading event prep…
        </p>
      ) : tasks.length === 0 && selections.length === 0 ? (
        <div className="document-empty">
          <p>Add dishes to the event menu to plan prep.</p>
        </div>
      ) : (
        <EventPrepList
          selections={selections}
          tasks={tasks}
          dishes={dishes}
          components={components ?? []}
          people={people ?? []}
          recipeFlags={recipeFlags}
          renderQuantityFlags={(flags) =>
            flags.map((flag) => (
              <p
                key={flag}
                className="text-sm text-danger"
                data-testid="suspect-prep-quantity"
              >
                {flag}
              </p>
            ))
          }
        />
      )}
      <EventDraftPoButton eventId={eventId} eventStage={eventStage} />
    </section>
  );
}
