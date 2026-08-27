import { useState, type FormEvent } from "react";
import { useIngredientUpdateCosting } from "../../lib/manifest-convex-react";

export type IngredientCostingTarget = {
  _id: string;
  version: number;
  unit: string;
  costPerUnit: number | string;
  status: string;
};

export function IngredientCostingEditor({
  ingredient,
  suggestedCostPerUnit,
  onFailure,
}: Readonly<{
  ingredient: IngredientCostingTarget;
  suggestedCostPerUnit?: number;
  onFailure: (error: unknown) => void;
}>) {
  const updateCosting = useIngredientUpdateCosting();
  const initialCost = Number(ingredient.costPerUnit);
  const seedCost =
    suggestedCostPerUnit != null &&
    suggestedCostPerUnit > 0 &&
    (!Number.isFinite(initialCost) || initialCost <= 0)
      ? suggestedCostPerUnit
      : initialCost;
  const [costPerUnit, setCostPerUnit] = useState(
    Number.isFinite(seedCost) ? seedCost.toFixed(2) : "0.00",
  );
  const [saving, setSaving] = useState(false);

  const parsedCost = Number(costPerUnit);
  const canEdit = ingredient.status === "active";
  const dirty =
    Number.isFinite(parsedCost) &&
    Math.abs(parsedCost - (Number.isFinite(initialCost) ? initialCost : 0)) >=
      0.005;
  const invalid =
    costPerUnit.trim() === "" || !Number.isFinite(parsedCost) || parsedCost < 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || invalid || !dirty) return;
    setSaving(true);
    onFailure(null);
    try {
      await updateCosting({
        docId: ingredient._id,
        version: ingredient.version,
        costPerUnit: parsedCost,
      });
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="culinary-section"
      aria-labelledby="ingredient-costing-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Catalog costing</p>
          <h2 id="ingredient-costing-heading">Unit cost</h2>
        </div>
        {!canEdit && <span>Reinstate to edit</span>}
      </div>
      <p className="max-w-160 text-base text-ink-2">
        Sets the catalog cost used when no receipt price is available. Lookup
        apply can fill this automatically. Confirmed receipt prices still come
        from purchasing receives.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => void save(event)}
      >
        <label className="grid min-w-40 flex-1 basis-40 gap-1 text-sm text-ink-2">
          <span>Cost per {ingredient.unit}</span>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={costPerUnit}
            disabled={!canEdit || saving}
            onChange={(event) => setCostPerUnit(event.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canEdit || invalid || !dirty || saving}
        >
          {saving ? "Saving…" : "Save cost"}
        </button>
      </form>
    </section>
  );
}
