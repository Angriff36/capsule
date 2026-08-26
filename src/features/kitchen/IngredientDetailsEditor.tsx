import { useState, type FormEvent } from "react";
import {
  useIngredientClassifyAllergens,
  useIngredientUpdateDetails,
} from "../../lib/manifest-convex-react";
import { type CulinaryAllergenCode } from "./CulinaryAllergenVocabulary";
import { IngredientAllergenFieldset } from "./IngredientAllergenFieldset";
import {
  UNIT_OF_MEASURE,
  unitOptionsFor,
  type UnitOfMeasure,
} from "./import/UnitOfMeasureMapper";

export type IngredientDetailsTarget = {
  _id: string;
  version: number;
  name: string;
  unit: string;
  category?: string | null;
  allergens?: readonly string[] | null;
  isGlutenFree?: boolean | null;
  status: string;
};

function isUnitOfMeasure(value: string): value is UnitOfMeasure {
  return (UNIT_OF_MEASURE as readonly string[]).includes(value);
}

function isAllergenCode(value: string): value is CulinaryAllergenCode {
  return (
    value === "milk" ||
    value === "eggs" ||
    value === "fish" ||
    value === "crustacean_shellfish" ||
    value === "tree_nuts" ||
    value === "peanuts" ||
    value === "wheat" ||
    value === "soybeans" ||
    value === "sesame"
  );
}

function sortedAllergenKey(codes: readonly CulinaryAllergenCode[]) {
  return [...codes]
    .sort((left, right) => left.localeCompare(right))
    .join("\u0000");
}

export function IngredientDetailsEditor({
  ingredient,
  onFailure,
}: Readonly<{
  ingredient: IngredientDetailsTarget;
  onFailure: (error: unknown) => void;
}>) {
  const updateDetails = useIngredientUpdateDetails();
  const classifyAllergens = useIngredientClassifyAllergens();
  const [name, setName] = useState(ingredient.name);
  const [unit, setUnit] = useState(ingredient.unit);
  const [category, setCategory] = useState(ingredient.category ?? "");
  const [allergens, setAllergens] = useState<CulinaryAllergenCode[]>(
    (ingredient.allergens ?? []).filter(isAllergenCode),
  );
  const [isGlutenFree, setIsGlutenFree] = useState(
    Boolean(ingredient.isGlutenFree),
  );
  const [saving, setSaving] = useState<"details" | "allergens" | null>(null);

  const detailsDirty =
    name.trim() !== ingredient.name ||
    unit !== ingredient.unit ||
    category.trim() !== (ingredient.category ?? "").trim();
  const initialAllergens = sortedAllergenKey(
    (ingredient.allergens ?? []).filter(isAllergenCode),
  );
  const allergensDirty =
    sortedAllergenKey(allergens) !== initialAllergens ||
    isGlutenFree !== Boolean(ingredient.isGlutenFree);
  const canEdit = ingredient.status === "active";

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || !detailsDirty || !isUnitOfMeasure(unit)) return;
    setSaving("details");
    onFailure(null);
    try {
      await updateDetails({
        docId: ingredient._id,
        version: ingredient.version,
        name: name.trim(),
        unit,
        category: category.trim() || undefined,
      });
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(null);
    }
  };

  const saveAllergens = async () => {
    if (!canEdit || !allergensDirty) return;
    setSaving("allergens");
    onFailure(null);
    try {
      await classifyAllergens({
        docId: ingredient._id,
        version: ingredient.version,
        allergens,
        isGlutenFree,
      });
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section
      className="culinary-section"
      aria-labelledby="ingredient-details-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Catalog record</p>
          <h2 id="ingredient-details-heading">Details</h2>
        </div>
        {!canEdit && <span>Reinstate to edit</span>}
      </div>

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => void saveDetails(event)}
      >
        <label className="field-label sm:col-span-2">
          <span>Name</span>
          <input
            className="input"
            value={name}
            disabled={!canEdit || saving != null}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Stock unit</span>
          <select
            className="input"
            value={unit}
            disabled={!canEdit || saving != null}
            onChange={(event) => setUnit(event.target.value)}
          >
            {unitOptionsFor(ingredient.unit).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Category</span>
          <input
            className="input"
            value={category}
            disabled={!canEdit || saving != null}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Produce, dairy, dry goods…"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEdit || !detailsDirty || saving != null}
          >
            {saving === "details" ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="culinary-section-heading">
          <h3 className="text-lg font-semibold text-ink">Allergens</h3>
          <span>
            {allergens.length} flagged
            {isGlutenFree ? " · gluten free" : ""}
          </span>
        </div>
        <IngredientAllergenFieldset
          allergens={allergens}
          isGlutenFree={isGlutenFree}
          onAllergensChange={setAllergens}
          onGlutenFreeChange={setIsGlutenFree}
          disabled={!canEdit || saving != null}
          idPrefix={`ingredient-${ingredient._id}`}
        />
        <div className="mt-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit || !allergensDirty || saving != null}
            onClick={() => void saveAllergens()}
          >
            {saving === "allergens" ? "Saving…" : "Save allergens"}
          </button>
        </div>
      </div>
    </section>
  );
}
