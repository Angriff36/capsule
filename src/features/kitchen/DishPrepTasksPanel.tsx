import { Link } from "react-router-dom";
import {
  useListDishTask,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { recipePath } from "./kitchenRoutes";

type Props = {
  dishId: string;
};

/** Dish-level prep task templates with recipe hyperlinks when linked. */
export function DishPrepTasksPanel({ dishId }: Props) {
  const tasks = useListDishTask();
  const recipes = useListRecipe();
  const rows = (tasks ?? [])
    .filter((task) => task.deletedAt == null && task.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Prep task templates</h2>
        <span>{rows.length} tasks</span>
      </div>
      {tasks === undefined ? (
        <p className="text-[13px] text-ink-2">Loading prep tasks…</p>
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No prep templates on this dish yet. Event prep is generated from
            these when a dish is added to an event.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((task) => {
            const recipe = task.recipeId
              ? recipes?.find((entry) => entry._id === task.recipeId)
              : null;
            return (
              <li
                key={task._id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-[14px] font-medium text-ink">
                    {task.name}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">
                    {task.category} · {task.taskType}
                    {task.defaultQuantity != null
                      ? ` · ${task.defaultQuantity} ${String(task.defaultUnit ?? "")}`
                      : ""}
                  </p>
                </div>
                {recipe ? (
                  <Link
                    to={recipePath(recipe._id)}
                    className="text-[13px] text-accent underline-offset-2 hover:underline"
                  >
                    Recipe: {recipe.name}
                  </Link>
                ) : task.recipeId ? (
                  <span className="text-[12px] text-ink-3">Recipe linked</span>
                ) : (
                  <span className="text-[12px] text-ink-3">No recipe</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
