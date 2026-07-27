import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateDishTask,
  useDishTaskRetire,
  useListDishTask,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { recipePath } from "./kitchenRoutes";

type Props = {
  dishId: string;
};

// The exact Category values printed on the real prep sheets, transcribed from
// the photographs into work/prep-lists-from-photos.csv. Kept as the sheet
// spells them so a printed list reads the same as the one the kitchen knows.
const CATEGORIES = [
  { value: "Finish at Event", label: "Finish at Event" },
  { value: "Finish at Kitchen", label: "Finish at Kitchen" },
  { value: "Drop Off", label: "Drop Off" },
  { value: "Drop Off Items", label: "Drop Off Items" },
  { value: "Bev - Non Alcohol", label: "Bev - Non Alcohol" },
  { value: "Side Items", label: "Side Items" },
] as const;

// Ordered so the units the sheets actually use most come first.
const UNITS = [
  "each",
  "serving",
  "portion",
  "pound",
  "ounce",
  "gram",
  "kilogram",
  "quart",
  "pint",
  "cup",
  "gallon",
  "liter",
  "milliliter",
  "tablespoon",
  "teaspoon",
  "batch",
  "melon",
  "bottle",
] as const;

/** Dish-level prep task templates with recipe hyperlinks when linked. */
export function DishPrepTasksPanel({ dishId }: Props) {
  const tasks = useListDishTask();
  const recipes = useListRecipe();
  const addTask = useCreateDishTask();
  const retireTask = useDishTaskRetire();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = (tasks ?? [])
    .filter(
      (task) =>
        task.deletedAt == null &&
        task.dishId === dishId &&
        task.status === "active",
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setError("A task name is required.");
      return;
    }
    const quantity = Number(data.get("defaultQuantity") ?? 0);
    setBusy("add");
    setError(null);
    setNotice(null);
    try {
      await addTask({
        dishId,
        name,
        category: String(data.get("category") ?? "Finish at Event"),
        station: String(data.get("station") ?? "").trim() || undefined,
        defaultQuantity: quantity > 0 ? quantity : undefined,
        defaultUnit: quantity > 0 ? String(data.get("defaultUnit")) : undefined,
        instructions:
          String(data.get("instructions") ?? "").trim() || undefined,
        sortOrder: rows.length,
      });
      form.reset();
      setNotice(
        "Template added. Every event this dish is added to now opens this prep task.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the template.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRetire(id: string, version: number | undefined) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await retireTask({ docId: id, version, reason: "Removed from dish" });
      setNotice("Template retired — it will not generate prep tasks again.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not retire the template.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Prep task templates</h2>
        <span>{rows.length} tasks</span>
      </div>

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-[13px] text-success" role="status">
          {notice}
        </p>
      ) : null}

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
                data-testid="dish-prep-template-row"
              >
                <div>
                  <p className="text-[14px] font-medium text-ink">
                    {task.name}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3">
                    {task.category} · {task.taskType}
                    {task.station ? ` · ${task.station}` : ""}
                    {task.defaultQuantity != null
                      ? ` · ${task.defaultQuantity} ${String(task.defaultUnit ?? "")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {recipe ? (
                    <Link
                      to={recipePath(recipe._id)}
                      className="text-[13px] text-accent underline-offset-2 hover:underline"
                    >
                      Recipe: {recipe.name}
                    </Link>
                  ) : task.recipeId ? (
                    <span className="text-[12px] text-ink-3">
                      Recipe linked
                    </span>
                  ) : (
                    <span className="text-[12px] text-ink-3">No recipe</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() => void onRetire(task._id, task.version)}
                  >
                    {busy === task._id ? "Working…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAdd}>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Task</span>
          <input
            name="name"
            className="input mt-1"
            placeholder="BRINE AIRLINE CHICKEN"
            required
          />
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Category</span>
          <select
            name="category"
            className="input mt-1"
            defaultValue="Finish at Event"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Station</span>
          <input
            name="station"
            className="input mt-1"
            placeholder="Apps - Passed - Finish at Event"
          />
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Per guest (0 = one each)</span>
          <input
            name="defaultQuantity"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            className="input mt-1"
          />
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Unit</span>
          <select name="defaultUnit" className="input mt-1" defaultValue="each">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Notes</span>
          <input
            name="instructions"
            className="input mt-1"
            placeholder="Weight after cooked"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy != null}
          >
            {busy === "add" ? "Adding…" : "Add prep template"}
          </button>
        </div>
      </form>
    </section>
  );
}
