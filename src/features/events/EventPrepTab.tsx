import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { setWorkingEvent } from "./workingEvent";
import {
  useListComponent,
  useListPerson,
  useListServiceStyle,
  useListStylePackaging,
} from "../../lib/manifest-convex-react";
import type {
  ServiceStyleOption,
  StylePackagingRow,
} from "../kitchen/stylePackaging";
import { useEventMenuLines } from "../../lib/useEventMenuLines";
import { useEventPrepTasks } from "../../lib/useEventRows";
import { useSharedRecipeRows } from "../../lib/useMenuRecipeRows";
import { useDishesByIds } from "../../lib/useDishesByIds";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventTabIntro } from "./EventTabIntro";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import { runBulkItems } from "../../ui/bulk-select";
import { suspectRowsFromRecipeLines } from "./eventMenuSuspectQuantity";

import { EventPrepList } from "./EventPrepList";
import { EventPrepWorkNotice } from "./EventPrepWorkNotice";
import { EventUnresolvedMaterialsNotice } from "./EventUnresolvedMaterialsNotice";

type Props = {
  eventId: string;
  eventStage: string;
  /** The event's service style picks which packaging line each dish shows. */
  serviceStyleId?: string | null;
  /** Event start, so the prep board opens on that event's week. */
  startsAt?: number | null;
};

export function EventPrepTab({
  eventId,
  eventStage,
  serviceStyleId,
  startsAt,
}: Props) {
  const eventDishes = useEventMenuLines(eventId);
  const components = useListComponent();
  const packaging = useListStylePackaging() as StylePackagingRow[] | undefined;
  const styles = useListServiceStyle() as ServiceStyleOption[] | undefined;
  const styleName = styles?.find((style) => style._id === serviceStyleId)?.name;
  const people = useListPerson();
  // The menu's dish lines and ingredients only. Recipes stay the whole list:
  // a prep step can name a sub-recipe that is not on a dish directly.
  const recipe = useSharedRecipeRows(eventDishes);
  const dishIngredients = recipe?.dishIngredients;
  const ingredients = recipe?.ingredients;
  const prepTasks = useEventPrepTasks(eventId);
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
  // Only the dishes this event's menu lines and prep tasks name.
  const dishes = useDishesByIds(
    eventDishes === undefined || prepTasks === undefined
      ? undefined
      : [
          ...eventDishes.map((row) => row.dishId),
          ...tasks.map((row) => row.dishId),
        ],
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
        <Link
          className="btn btn-ghost"
          to={
            startsAt != null
              ? `/kitchen/prep?from=${new Date(startsAt).toLocaleDateString("en-CA")}`
              : "/kitchen/prep"
          }
          onClick={() => setWorkingEvent(eventId)}
        >
          Open prep board
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
      <EventUnresolvedMaterialsNotice eventId={eventId} />
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
          serviceStyleId={serviceStyleId}
          serviceStyleName={styleName}
          packaging={packaging}
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
