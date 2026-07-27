import { useState } from "react";
import { useIngredientSetNutrition } from "../../lib/manifest-convex-react";
import {
  NUTRIENTS,
  type IngredientNutritionFields,
} from "./ComponentNutrition";

export type IngredientNutritionTarget = IngredientNutritionFields & {
  _id: string;
  version: number;
  unit: string;
  status: string;
};

function initialFieldValue(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value))
    ? ""
    : String(Number(value));
}

export function IngredientNutritionEditor({
  ingredient,
  onFailure,
}: Readonly<{
  ingredient: IngredientNutritionTarget;
  onFailure: (error: unknown) => void;
}>) {
  const setNutrition = useIngredientSetNutrition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      NUTRIENTS.map((nutrient) => [
        nutrient.field,
        initialFieldValue(ingredient[nutrient.field]),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);

  const canEdit = ingredient.status === "active";
  const dirty = NUTRIENTS.some(
    (nutrient) =>
      values[nutrient.field] !== initialFieldValue(ingredient[nutrient.field]),
  );
  const invalid = NUTRIENTS.some((nutrient) => {
    const raw = values[nutrient.field]?.trim();
    if (!raw) return false;
    const parsed = Number(raw);
    return !Number.isFinite(parsed) || parsed < 0;
  });

  const save = async () => {
    if (!canEdit || invalid || !dirty) return;
    setSaving(true);
    onFailure(null);
    try {
      // Editor sends the full panel; a blank field is omitted, which the command
      // treats as "not recorded" (clears the stored value).
      const params: Record<string, number> = {};
      for (const nutrient of NUTRIENTS) {
        const raw = values[nutrient.field]?.trim();
        if (raw) params[nutrient.field] = Number(raw);
      }
      await setNutrition({
        docId: ingredient._id,
        version: ingredient.version,
        ...params,
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
      aria-labelledby="ingredient-nutrition-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Catalog nutrition</p>
          <h2 id="ingredient-nutrition-heading">
            Nutrition per {ingredient.unit}
          </h2>
        </div>
        {!canEdit && <span>Reinstate to edit</span>}
      </div>
      <p className="max-w-160 text-[13px] text-ink-2">
        Values for one {ingredient.unit} of this ingredient. Components and
        menus aggregate these into per-portion panels. Leave a field blank when
        the value is unknown.
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {NUTRIENTS.map((nutrient) => (
          <label
            key={nutrient.key}
            className="grid gap-1 text-[12px] text-ink-2"
          >
            <span>
              {nutrient.label} ({nutrient.unit})
            </span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={values[nutrient.field] ?? ""}
              disabled={!canEdit || saving}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [nutrient.field]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEdit || invalid || !dirty || saving}
          >
            {saving ? "Saving…" : "Save nutrition"}
          </button>
        </div>
      </form>
    </section>
  );
}
