import { Link } from "react-router-dom";
import { recipeUnitRatio } from "../../lib/recipeUnitConversion";
import { formatStatusLabel } from "../../lib/statusLabels";
import { eventDetailPath } from "../events/eventRoutes";
import { componentPath } from "./kitchenRoutes";
import { readableRecipeAmount } from "./RecipeNotes";

type Recipe = {
  _id: string;
  yieldQuantity: number;
  yieldUnit: string;
};
type Task = {
  _id: string;
  eventId: string;
  componentId?: string | null;
  name: string;
  quantity: number;
  completedQuantity?: number | null;
  unit: string;
  status: string;
  deletedAt?: number | null;
};

/** Preview a recorded prep amount in recipe units; never infer density or portions. */
export function prepRecipeYield(recipe: Recipe, task: Task | null | undefined) {
  if (
    !task ||
    task.deletedAt != null ||
    task.componentId !== recipe._id ||
    !Number.isFinite(task.quantity) ||
    task.quantity < 0
  )
    return null;
  const ratio = recipeUnitRatio(task.unit, recipe.yieldUnit);
  if (ratio == null) return null;
  const amount = task.quantity * ratio;
  return Number.isFinite(amount) ? amount : null;
}

export function ComponentPrepContext({
  recipe,
  task,
  event,
}: {
  recipe: Recipe;
  task: Task | null | undefined;
  event: { _id: string; title: string } | null | undefined;
}) {
  if (task === undefined)
    return (
      <p className="mt-4 text-base text-ink-2" role="status">
        Loading event prep…
      </p>
    );
  if (!task || task.deletedAt != null)
    return (
      <p className="mt-4 text-base text-ink-2" role="status">
        Prep task unavailable. Recipe quantities can still be scaled below.
      </p>
    );
  if (task.componentId !== recipe._id)
    return (
      <div className="mt-4 text-base text-ink-2" role="status">
        <p>This prep task no longer uses this recipe.</p>
        {task.componentId ? (
          <Link
            className="inline-flex min-h-11 items-center text-accent underline"
            to={componentPath(task.componentId, task._id)}
          >
            Open the task’s current recipe
          </Link>
        ) : null}
      </div>
    );
  const settled = task.status === "completed" || task.status === "cancelled";
  return (
    <section
      className="mt-4 space-y-1 text-base text-ink-2"
      aria-label="Event prep context"
    >
      <p>
        For{" "}
        {event ? (
          <Link
            className="inline-flex min-h-11 items-center text-accent underline"
            to={eventDetailPath(event._id, "prep")}
          >
            {event.title}
          </Link>
        ) : event === undefined ? (
          "Loading event…"
        ) : (
          "Event unavailable"
        )}
      </p>
      <p className="font-medium text-ink">{task.name}</p>
      <p>
        {settled ? "Recorded prep amount" : "Prep amount"}:{" "}
        {readableRecipeAmount(task.quantity, task.unit)} ·{" "}
        {formatStatusLabel(task.status)}
        {settled ? " · Current recipe" : ""}
      </p>
      {task.completedQuantity != null ? (
        <p>
          {readableRecipeAmount(task.completedQuantity, task.unit)} completed
        </p>
      ) : null}
      {prepRecipeYield(recipe, task) == null ? (
        <p>
          This recipe yields{" "}
          {readableRecipeAmount(recipe.yieldQuantity, recipe.yieldUnit)}. The
          prep and recipe units need a measured conversion; enter the yield
          needed below to scale it.
        </p>
      ) : null}
    </section>
  );
}
