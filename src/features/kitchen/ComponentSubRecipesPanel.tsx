import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  useAddNestedRecipeLine,
  useReconcileLiveEventsForComponent,
} from "../../lib/culinaryDemandClient";
import {
  useComponentComponentRemove,
  useListComponent,
  useListComponentComponent,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { readableRecipeAmount } from "./RecipeNotes";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";

/** Recipes this recipe is built from. The seam refuses a line that would make
 *  a recipe contain itself; that refusal is shown on the form. */
export function ComponentSubRecipesPanel({
  componentId,
}: {
  componentId: string;
}) {
  const lines = useListComponentComponent();
  const recipes = useListComponent();
  const addLine = useAddNestedRecipeLine();
  const removeLine = useComponentComponentRemove();
  const reconcileEvents = useReconcileLiveEventsForComponent();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = (lines ?? [])
    .filter(
      (line) =>
        line.deletedAt == null &&
        line.addedAt != null &&
        line.componentId === componentId,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const choices = (recipes ?? [])
    .filter((recipe) => recipe.deletedAt == null && recipe._id !== componentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) =>
    recipes?.find((recipe) => recipe._id === id)?.name ?? "Unknown recipe";

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const childComponentId = String(data.get("childComponentId") ?? "");
    const quantity = Number(data.get("quantity"));
    if (!childComponentId || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Pick a recipe and a quantity above zero.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      await addLine({
        componentId,
        childComponentId,
        quantity,
        unit: String(data.get("unit") ?? "each"),
        sortOrder: rows.length,
      });
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the sub-recipe line.",
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
    const reason = (
      await prompt.askReason({
        title: "Remove sub-recipe",
        description: `Remove ${name} from this recipe.`,
        label: "Removal reason",
        confirmLabel: "Remove sub-recipe",
        tone: "danger",
      })
    )?.trim();
    if (!reason) return;
    setBusy(id);
    setError(null);
    try {
      await removeLine({ docId: id, reason, version });
      await reconcileEvents(componentId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the sub-recipe line.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Sub-recipes</h2>
        <span>
          {lines === undefined
            ? "Loading…"
            : formatCountNoun(rows.length, "sub-recipe")}
        </span>
      </div>
      {host}
      {error ? (
        <p className="text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {lines === undefined ? (
        <TableSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>This recipe is built from ingredients only.</p>
        </div>
      ) : (
        <ul className="ingredient-list">
          {rows.map((line) => (
            <li key={line._id}>
              <strong>
                {readableRecipeAmount(Number(line.quantity), String(line.unit))}
              </strong>
              <span>
                <CulinaryEntityLink kind="component" id={line.childComponentId}>
                  {nameOf(line.childComponentId)}
                </CulinaryEntityLink>
              </span>
              <span>{line.prepNotes || "No preparation note"}</span>
              <div className="culinary-line-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() =>
                    void onRemove(
                      line._id,
                      line.version,
                      nameOf(line.childComponentId),
                    )
                  }
                >
                  {busy === line._id ? "Working…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="culinary-line-form" onSubmit={onAdd}>
        <label className="field-label sm:col-span-2">
          Recipe
          <select name="childComponentId" className="input" required>
            {choices.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Quantity
          <input
            name="quantity"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={1}
            className="input"
            required
          />
        </label>
        <label className="field-label">
          Unit
          <select name="unit" className="input">
            {SELECTABLE_UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-primary self-end"
          disabled={busy != null || choices.length === 0}
        >
          {busy === "add" ? "Adding…" : "Add sub-recipe"}
        </button>
      </form>
    </section>
  );
}
