import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateDishIngredient,
  useDishIngredientAdjustQuantity,
  useDishIngredientRemove,
  useListDishIngredient,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import {
  SELECTABLE_UNITS,
  UNIT_OF_MEASURE,
} from "./import/UnitOfMeasureMapper";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import {
  RECIPE_QUANTITY_INPUT_MODE,
  RECIPE_QUANTITY_INPUT_TYPE,
  commitRecipeQuantity,
  formatRecipeQuantity,
} from "../events/eventMenuRecipeQuantity";
import { applyDishIngredientRemoval } from "./dishIngredientRemoval";

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
  const adjustQuantity = useDishIngredientAdjustQuantity();
  const removeLine = useDishIngredientRemove();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Same reasoning as the prep-template form: a dish's lines share a unit far
  // more often than not, so it holds its last value instead of resetting.
  const [unit, setUnit] = useState("each");
  const { prompt, host: promptHost } = useActionPrompt();

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
    const qtyCommit = commitRecipeQuantity(
      data.get("quantity"),
      "Quantity per serving must be greater than zero.",
    );
    if (!ingredientId) {
      setError("Pick an ingredient.");
      return;
    }
    if (!qtyCommit.ok) {
      setError(qtyCommit.error);
      return;
    }
    const quantity = qtyCommit.quantity;
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

  async function onSaveQty(
    event: FormEvent<HTMLFormElement>,
    line: (typeof rows)[number],
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const qtyCommit = commitRecipeQuantity(
      data.get("quantity"),
      "Quantity per serving must be greater than zero.",
    );
    const nextUnit = String(data.get("unit") ?? line.unit);
    if (!qtyCommit.ok) {
      setError(qtyCommit.error);
      return;
    }
    const quantity = qtyCommit.quantity;
    setBusy(`qty:${line._id}`);
    setError(null);
    setNotice(null);
    try {
      await adjustQuantity({
        docId: line._id,
        version: line.version,
        quantity,
        unit: nextUnit as (typeof UNIT_OF_MEASURE)[number],
      });
      setNotice("Quantity saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the recipe quantity.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(
    id: string,
    version: number | undefined,
    name: string,
  ) {
    const confirmed = await prompt.askConfirm({
      title: "Remove ingredient",
      description: `Remove "${name}" from this dish? Events using this dish stop demanding it.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep as-is",
      tone: "danger",
    });
    let intent: "keep" | "remove" = "keep";
    try {
      intent = await applyDishIngredientRemoval({
        confirmed,
        remove: () =>
          removeLine({ docId: id, version, reason: "Removed from dish" }),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the ingredient.",
      );
      return;
    }
    if (intent !== "remove") return;
    setNotice("Ingredient removed.");
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Ingredients</h2>
        <span>{formatCountNoun(rows.length, "line")}</span>
      </div>

      {promptHost}
      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {lines === undefined ? (
        <TableSkeleton rows={3} />
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
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => void onSaveQty(event, line)}
              >
                <div>
                  <p className="text-lg font-medium text-ink">
                    {ingredientName(String(line.ingredientId))}
                  </p>
                  {line.prepNotes ? (
                    <p className="font-mono text-xs text-ink-3">
                      {line.prepNotes}
                    </p>
                  ) : null}
                </div>
                <label className="block text-sm">
                  <span className="meta-term">Qty</span>
                  <input
                    className="input mt-1 w-24"
                    name="quantity"
                    type={RECIPE_QUANTITY_INPUT_TYPE}
                    inputMode={RECIPE_QUANTITY_INPUT_MODE}
                    autoComplete="off"
                    spellCheck={false}
                    defaultValue={formatRecipeQuantity(line.quantity)}
                    data-testid="kitchen-dish-recipe-qty"
                  />
                </label>
                <label className="block text-sm">
                  <span className="meta-term">Unit</span>
                  <select
                    className="input mt-1 w-28"
                    name="unit"
                    defaultValue={String(line.unit)}
                    data-testid="kitchen-dish-recipe-unit"
                  >
                    {SELECTABLE_UNITS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                >
                  {busy === `qty:${line._id}` ? "Saving…" : "Save qty"}
                </button>
              </form>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy != null}
                data-testid="kitchen-dish-remove-ingredient"
                onClick={() =>
                  void onRemove(
                    line._id,
                    line.version,
                    ingredientName(String(line.ingredientId)),
                  )
                }
              >
                {busy === line._id ? "Working…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAdd}>
        <label className="block text-sm sm:col-span-2">
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
        <label className="block text-sm">
          <span className="meta-term">Per serving</span>
          <input
            name="quantity"
            type={RECIPE_QUANTITY_INPUT_TYPE}
            inputMode={RECIPE_QUANTITY_INPUT_MODE}
            autoComplete="off"
            spellCheck={false}
            defaultValue=""
            className="input mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="meta-term">Unit</span>
          <select
            name="unit"
            className="input mt-1"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {SELECTABLE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
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
