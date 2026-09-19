import { useState } from "react";
import { useIngredientMergeInto } from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import type { IngredientCatalogRow } from "./IngredientCatalogLabel";
import { IngredientOptionPicker } from "./IngredientOptionPicker";

/**
 * Two catalog rows for the same food. Merging points this one at the row the
 * kitchen keeps and takes it out of the pickers; recipe lines that already
 * name it keep working.
 */
export function IngredientMergeControl({
  ingredientId,
  ingredientName,
  version,
  ingredients,
  onFailure,
}: {
  ingredientId: string;
  ingredientName: string;
  version: number;
  ingredients: readonly IngredientCatalogRow[] | undefined;
  onFailure: (error: unknown) => void;
}) {
  const mergeInto = useIngredientMergeInto();
  const { prompt, host } = useActionPrompt();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  const choices = (ingredients ?? []).filter((row) => row._id !== ingredientId);
  const target = choices.find((row) => row._id === targetId);

  const onMerge = () => {
    if (!target) return;
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Merge ingredients",
          description: `Merge "${ingredientName}" into "${target.name}". This ingredient leaves the catalog.`,
          label: "Reason",
          confirmLabel: "Merge ingredients",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      onFailure(null);
      setBusy(true);
      try {
        await mergeInto({
          docId: ingredientId,
          version,
          targetIngredientId: target._id,
          reason,
        });
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="culinary-section" aria-labelledby="merge-heading">
      <div className="culinary-section-heading">
        <h2 id="merge-heading">Merge into another ingredient</h2>
      </div>
      <p className="max-w-160 text-base text-ink-2">
        Pick the row the kitchen keeps. Recipes that name this ingredient still
        cost and order correctly after the merge.
      </p>
      {host}
      <div className="mt-3 max-w-160">
        <IngredientOptionPicker
          ingredients={choices}
          value={targetId}
          onChange={setTargetId}
        />
      </div>
      <button
        type="button"
        className="btn btn-ghost mt-3"
        disabled={busy || !target}
        title={target ? undefined : "Choose the ingredient to keep first"}
        onClick={onMerge}
      >
        {busy ? "Merging…" : "Merge this into that"}
      </button>
    </section>
  );
}
