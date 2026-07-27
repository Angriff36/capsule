import { useState, type FormEvent } from "react";
import {
  useCreateDishIngredient,
  useDishIngredientRemove,
  useListDishIngredient,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import { UNIT_OF_MEASURE } from "./import/UnitOfMeasureMapper";

type Props = {
  dishId: string;
};

/**
 * The dish's own ingredients. A dish IS the recipe — steak, salt and oil belong
 * here, not on a separate record you have to create first. Only the parts you
 * actually make by hand (the peppercorn sauce, the honey butter) become
 * Components, and those carry their own ingredients.
 */
export function DishIngredientsPanel({ dishId }: Props) {
  const lines = useListDishIngredient();
  const ingredients = useListIngredient();
  const addLine = useCreateDishIngredient();
  const removeLine = useDishIngredientRemove();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Same reasoning as the prep-template form: a dish's lines share a unit far
  // more often than not, so it holds its last value instead of resetting.
  const [unit, setUnit] = useState("each");

  const rows = (lines ?? [])
    .filter((line) => line.deletedAt == null && line.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const ingredientName = (id: string) =>
    ingredients?.find((row) => row._id === id)?.name ?? "Unknown ingredient";

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ingredientId = String(data.get("ingredientId") ?? "");
    const quantity = Number(data.get("quantity") ?? 0);
    if (!ingredientId) {
      setError("Pick an ingredient.");
      return;
    }
    if (!(quantity > 0)) {
      setError("Quantity per serving must be greater than zero.");
      return;
    }
    setBusy("add");
    setError(null);
    setNotice(null);
    try {
      await addLine({
        dishId,
        ingredientId,
        quantity,
        unit: unit as (typeof UNIT_OF_MEASURE)[number],
        sortOrder: rows.length,
        prepNotes: String(data.get("prepNotes") ?? "").trim() || undefined,
      });
      form.reset();
      setNotice(
        "Ingredient added. Every event this dish is added to now demands it.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the ingredient.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(id: string, version: number | undefined) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await removeLine({ docId: id, version, reason: "Removed from dish" });
      setNotice("Ingredient removed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the ingredient.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Ingredients</h2>
        <span>{rows.length} lines</span>
      </div>

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-[13px] text-success" role="status">
          {notice}
        </p>
      ) : null}

      {lines === undefined ? (
        <p className="text-[13px] text-ink-2">Loading ingredients…</p>
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No ingredients on this dish yet. Quantities are per serving, so they
            scale to whatever headcount an event has.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((line) => (
            <li
              key={line._id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
              data-testid="dish-ingredient-row"
            >
              <div>
                <p className="text-[14px] font-medium text-ink">
                  {ingredientName(String(line.ingredientId))}
                </p>
                <p className="font-mono text-[11px] text-ink-3">
                  {line.quantity} {String(line.unit)} per serving
                  {line.prepNotes ? ` · ${line.prepNotes}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy != null}
                onClick={() => void onRemove(line._id, line.version)}
              >
                {busy === line._id ? "Working…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAdd}>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Ingredient</span>
          <select name="ingredientId" className="input mt-1" required>
            <option value="">Select an ingredient…</option>
            {(ingredients ?? [])
              .filter((row) => row.deletedAt == null)
              .map((row) => (
                <option key={row._id} value={row._id}>
                  {row.name}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Per serving</span>
          <input
            name="quantity"
            type="number"
            min={0}
            // Per-serving rates are finer than cents on the real sheets.
            step="any"
            defaultValue={0}
            className="input mt-1"
          />
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Unit</span>
          <select
            name="unit"
            className="input mt-1"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {UNIT_OF_MEASURE.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Prep note</span>
          <input
            name="prepNotes"
            className="input mt-1"
            placeholder="diced small"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy != null}
          >
            {busy === "add" ? "Adding…" : "Add ingredient"}
          </button>
        </div>
      </form>
    </section>
  );
}
