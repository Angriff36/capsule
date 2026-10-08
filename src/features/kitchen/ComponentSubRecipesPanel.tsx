import { useState, type FormEvent } from "react";
import { formatCountNoun } from "../../lib/format";
import {
  useAddNestedRecipeLine,
  useReconcileLiveEventsForComponent,
} from "../../lib/culinaryDemandClient";
import {
  useComponentComponentAdjustQuantity,
  useComponentComponentRemove,
  useListComponent,
  useListComponentComponent,
  useListItemUnitMapping,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { readableRecipeAmount } from "./RecipeNotes";
import { RecordedUnitMappings } from "../../lib/recordedUnitMappings";
import { QuantityUnitInput } from "../../ui/QuantityUnitInput";
import {
  describeLineConversion,
  fallbackUnitFor,
  formatQuantityEntry,
  isUnitCode,
  parseQuantityInput,
  type ItemUnitMappingLike,
} from "../../../convex/lib/culinaryModel/units";
import { UNIT_OF_MEASURE } from "./import/UnitOfMeasureMapper";

/** Recipes this recipe is built from. The seam refuses a line that would make
 *  a recipe contain itself; that refusal is shown on the form. */
export function ComponentSubRecipesPanel({
  componentId,
}: {
  componentId: string;
}) {
  const lines = useListComponentComponent();
  const recipes = useListComponent();
  const itemUnitMappings = useListItemUnitMapping();
  const addLine = useAddNestedRecipeLine();
  const adjustLine = useComponentComponentAdjustQuantity();
  const removeLine = useComponentComponentRemove();
  const reconcileEvents = useReconcileLiveEventsForComponent();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childComponentId, setChildComponentId] = useState("");
  const [quantityEntry, setQuantityEntry] = useState("1");
  const [editingLine, setEditingLine] = useState<{
    id: string;
    value: string;
  } | null>(null);

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
  const recipeFor = (id: string) =>
    recipes?.find((recipe) => recipe._id === id);
  const selectedRecipe = recipeFor(childComponentId);
  const mappings = RecordedUnitMappings.fromRows(
    itemUnitMappings,
  ) as ItemUnitMappingLike[];
  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedId = String(data.get("childComponentId") ?? "");
    const child = recipeFor(selectedId);
    const parsed = parseQuantityInput(
      quantityEntry,
      fallbackUnitFor(child?.yieldUnit, UNIT_OF_MEASURE),
      UNIT_OF_MEASURE,
    );
    if (!selectedId || !child) {
      setError("Pick a recipe and a quantity above zero.");
      return;
    }
    if (parsed.status !== "parsed") {
      setError(
        parsed.status === "empty"
          ? "Enter a quantity before saving."
          : parsed.message,
      );
      return;
    }
    setBusy("add");
    setError(null);
    try {
      await addLine({
        componentId,
        childComponentId: selectedId,
        quantity: parsed.quantity,
        unit: parsed.unit,
        sortOrder: rows.length,
      });
      await reconcileEvents(componentId);
      form.reset();
      setChildComponentId("");
      setQuantityEntry("1");
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

  async function onAdjust(line: (typeof rows)[number]) {
    if (!editingLine || editingLine.id !== line._id) return;
    const parsed = parseQuantityInput(
      editingLine.value,
      fallbackUnitFor(line.unit, UNIT_OF_MEASURE),
      UNIT_OF_MEASURE,
    );
    if (parsed.status !== "parsed") {
      setError(
        parsed.status === "empty"
          ? "Enter a quantity before saving."
          : parsed.message,
      );
      return;
    }
    setBusy(line._id);
    setError(null);
    try {
      await adjustLine({
        docId: line._id,
        version: line.version,
        quantity: parsed.quantity,
        unit: parsed.unit,
      });
      await reconcileEvents(componentId);
      setEditingLine(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change the sub-recipe quantity.",
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
      title: "Remove sub-recipe",
      description: `Remove ${name} from this recipe.`,
      confirmLabel: "Remove sub-recipe",
      tone: "danger",
    });
    if (!confirmed) return;
    const reason = "Removed in the recipe editor";
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
              {editingLine?.id === line._id ? (
                <div className="min-w-44">
                  <QuantityUnitInput
                    name={`sub-recipe-line-${line._id}`}
                    value={editingLine.value}
                    onChange={(value) =>
                      setEditingLine({ id: line._id, value })
                    }
                    fallbackUnit={fallbackUnitFor(line.unit, UNIT_OF_MEASURE)}
                    canonicalUnit={recipeFor(line.childComponentId)?.yieldUnit}
                    allowedUnits={UNIT_OF_MEASURE}
                    mappings={mappings}
                    scope={{
                      itemKind: "component",
                      itemId: line.childComponentId,
                    }}
                  />
                </div>
              ) : (
                <strong>
                  {readableRecipeAmount(
                    Number(line.quantity),
                    String(line.unit),
                  )}
                  {(() => {
                    const child = recipeFor(line.childComponentId);
                    const conversion = isUnitCode(line.unit)
                      ? describeLineConversion(
                          Number(line.quantity),
                          line.unit,
                          child?.yieldUnit,
                          mappings,
                          {
                            itemKind: "component",
                            itemId: line.childComponentId,
                          },
                        )
                      : {
                          status: "unresolved" as const,
                          reason: `Recipe unit "${String(line.unit)}" is not recognized.`,
                        };
                    return conversion.status === "unresolved" ? (
                      <span className="block text-xs font-normal text-warn">
                        {conversion.reason}
                      </span>
                    ) : null;
                  })()}
                </strong>
              )}
              <span>
                <CulinaryEntityLink kind="component" id={line.childComponentId}>
                  {nameOf(line.childComponentId)}
                </CulinaryEntityLink>
              </span>
              <span>{line.prepNotes || "No preparation note"}</span>
              <div className="culinary-line-actions">
                {editingLine?.id === line._id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => void onAdjust(line)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => setEditingLine(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      setEditingLine({
                        id: line._id,
                        value: formatQuantityEntry(
                          Number(line.quantity),
                          line.unit,
                        ),
                      })
                    }
                  >
                    Adjust
                  </button>
                )}
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
          <select
            name="childComponentId"
            className="input"
            required
            value={childComponentId}
            onChange={(event) => setChildComponentId(event.target.value)}
          >
            <option value="">Select a recipe</option>
            {choices.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Quantity
          <QuantityUnitInput
            name="quantity"
            value={quantityEntry}
            onChange={setQuantityEntry}
            fallbackUnit={fallbackUnitFor(
              selectedRecipe?.yieldUnit,
              UNIT_OF_MEASURE,
            )}
            canonicalUnit={selectedRecipe?.yieldUnit}
            allowedUnits={UNIT_OF_MEASURE}
            mappings={mappings}
            scope={
              selectedRecipe
                ? { itemKind: "component", itemId: selectedRecipe._id }
                : undefined
            }
            required
          />
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
