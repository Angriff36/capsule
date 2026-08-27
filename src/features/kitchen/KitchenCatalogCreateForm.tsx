import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  NUTRIENTS,
  type IngredientNutritionFields,
} from "./ComponentNutrition";
import {
  SELECTABLE_UNITS,
  type UnitOfMeasure,
} from "./import/UnitOfMeasureMapper";
import { IngredientAllergenFieldset } from "./IngredientAllergenFieldset";
import type { CulinaryAllergenCode } from "./CulinaryAllergenVocabulary";
import { IngredientDatabaseLookup } from "./lookup/IngredientDatabaseLookup";
import type { IngredientAutofillProfile } from "./lookup/ExternalIngredientProfile";
import { KITCHEN_SECTION_SINGULAR, type KitchenSection } from "./kitchenRoutes";
import { scaleNutritionFromGramsToUnit } from "../../lib/nutritionUnitScale";
import type { NutritionFields } from "../../lib/nutritionUnitScale";

const UNITS = SELECTABLE_UNITS;

function UnitField({
  name,
  label,
  value,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  value?: string;
  onChange?: (unit: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-label">
      {label}
      <select
        name={name}
        className="input"
        value={value}
        disabled={disabled}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
      >
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

type Props = {
  section: KitchenSection;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function KitchenCatalogCreateForm({ section, busy, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<UnitOfMeasure>("each");
  const [category, setCategory] = useState("");
  const [createAllergens, setCreateAllergens] = useState<
    CulinaryAllergenCode[]
  >([]);
  const [createGlutenFree, setCreateGlutenFree] = useState(false);
  const [lookupGramNutrition, setLookupGramNutrition] = useState<
    Partial<IngredientNutritionFields>
  >({});
  const [lookupImageUrl, setLookupImageUrl] = useState("");
  const [lookupServingGrams, setLookupServingGrams] = useState<
    number | undefined
  >(undefined);
  const [lookupBarcode, setLookupBarcode] = useState("");
  const [lookupBrandOwner, setLookupBrandOwner] = useState("");
  const [lookupCategory, setLookupCategory] = useState("");
  const scaledLookupNutrition = useMemo(() => {
    const gramFields: NutritionFields = {};
    for (const nutrient of NUTRIENTS) {
      const value = lookupGramNutrition[nutrient.field];
      if (value != null && Number(value) > 0) {
        gramFields[nutrient.field] = Number(value);
      }
    }
    return scaleNutritionFromGramsToUnit(gramFields, unit, lookupServingGrams);
  }, [lookupGramNutrition, unit, lookupServingGrams]);

  const applyAutofill = (profile: IngredientAutofillProfile) => {
    setName(profile.name);
    setUnit(profile.unit);
    setCategory((existing) => profile.category ?? existing);
    setCreateAllergens((existing) =>
      profile.allergens.length > 0
        ? [...new Set([...existing, ...profile.allergens])]
        : existing,
    );
    setCreateGlutenFree((existing) => {
      if (profile.isGlutenFree) return true;
      if (profile.allergens.includes("wheat")) return false;
      return existing;
    });
    setLookupGramNutrition(profile.nutrition);
    setLookupImageUrl(profile.imageUrl ?? "");
    setLookupServingGrams(profile.servingGramsPerUnit);
    setLookupBarcode(profile.barcode ?? "");
    setLookupBrandOwner(profile.brandOwner ?? "");
    setLookupCategory(profile.category ?? "");
  };

  const hasNutrition = NUTRIENTS.some((nutrient) => {
    const value = lookupGramNutrition[nutrient.field];
    return value != null && Number(value) > 0;
  });

  return (
    <form onSubmit={onSubmit} className="culinary-create-form">
      <div className="culinary-create-heading">
        <div>
          <p className="eyebrow">New record</p>
          <h2 className="font-display text-xl">
            Add {KITCHEN_SECTION_SINGULAR[section]}
          </h2>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      <div className="culinary-create-grid">
        {section === "ingredients" ? (
          <>
            <div className="sm:col-span-2">
              <IngredientDatabaseLookup
                disabled={busy}
                catalogUnit={unit}
                onApply={applyAutofill}
              />
              <input
                type="hidden"
                name="lookupImageUrl"
                value={lookupImageUrl}
              />
              <input
                type="hidden"
                name="lookupServingGrams"
                value={
                  lookupServingGrams != null && lookupServingGrams > 0
                    ? String(lookupServingGrams)
                    : ""
                }
              />
              <input type="hidden" name="lookupBarcode" value={lookupBarcode} />
              <input
                type="hidden"
                name="lookupBrandOwner"
                value={lookupBrandOwner}
              />
              <input
                type="hidden"
                name="lookupCategory"
                value={lookupCategory}
              />
              <input type="hidden" name="lookupProductName" value={name} />
            </div>
            <label className="field-label">
              Name
              <input
                name="name"
                className="input"
                required
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <UnitField
              name="unit"
              label="Stock unit"
              value={unit}
              disabled={busy}
              onChange={(value) => setUnit(value as UnitOfMeasure)}
            />
            <label className="field-label">
              Cost per unit
              <input
                name="costPerUnit"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Category
              <input
                name="category"
                className="input"
                value={category}
                disabled={busy}
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            <label className="field-label sm:col-span-2">
              <span className="mb-2 block">Allergens</span>
              <IngredientAllergenFieldset
                allergens={createAllergens}
                isGlutenFree={createGlutenFree}
                onAllergensChange={setCreateAllergens}
                onGlutenFreeChange={setCreateGlutenFree}
                disabled={busy}
                formMode
                idPrefix="create-ingredient"
              />
            </label>
            {hasNutrition ? (
              <div className="sm:col-span-2 rounded-xs border border-line bg-panel px-3 py-2 text-sm text-ink-2">
                <p className="font-medium text-ink">Nutrition from lookup</p>
                <p className="mt-1">
                  {NUTRIENTS.filter((nutrient) => {
                    const value = lookupGramNutrition[nutrient.field];
                    return value != null && Number(value) > 0;
                  })
                    .map((nutrient) => {
                      const scaledValue =
                        scaledLookupNutrition?.[nutrient.field] ??
                        lookupGramNutrition[nutrient.field];
                      const unitLabel = scaledLookupNutrition
                        ? unit
                        : "gram (lookup)";
                      return `${nutrient.label}: ${scaledValue} ${nutrient.unit}/${unitLabel}`;
                    })
                    .join(" · ")}
                </p>
                {NUTRIENTS.map((nutrient) => {
                  const value = lookupGramNutrition[nutrient.field];
                  if (value == null || Number(value) <= 0) return null;
                  return (
                    <input
                      key={nutrient.field}
                      type="hidden"
                      name={`nutrition_${nutrient.field}`}
                      value={String(value)}
                    />
                  );
                })}
              </div>
            ) : null}
            <label className="field-label sm:col-span-2">
              Photo
              <input
                name="photo"
                type="file"
                accept="image/*"
                className="input"
              />
              <span className="field-hint">
                Optional — shows on the catalog card and ingredient detail.
              </span>
            </label>
          </>
        ) : (
          <label className="field-label">
            Name
            <input name="name" className="input" required autoFocus />
          </label>
        )}
        {section === "components" ? (
          <>
            <label className="field-label">
              Yield
              <input
                name="yieldQuantity"
                type="number"
                min={1}
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <UnitField name="yieldUnit" label="Yield unit" />
            <label className="field-label">
              Batch multiplier
              <input
                name="batchMultiplier"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Cuisine
              <input name="cuisine" className="input" />
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
            <label className="field-label sm:col-span-2">
              Method
              <textarea name="instructions" className="input min-h-28 py-2" />
            </label>
          </>
        ) : null}
        {section === "dishes" ? (
          <>
            <label className="field-label">
              Portion size
              <input
                name="portionSize"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <UnitField name="portionUnit" label="Portion unit" />
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Course
              <input name="course" className="input" />
            </label>
            <label className="field-label">
              Service style
              <input name="serviceStyle" className="input" />
            </label>
            <label className="field-label sm:col-span-2">
              Dietary tags
              <input
                name="dietaryTags"
                className="input"
                placeholder="vegan, gluten-free"
              />
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
          </>
        ) : null}
        {section === "menus" ? (
          <>
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Base price
              <input
                name="basePrice"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Price per person
              <input
                name="pricePerPerson"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Minimum guests
              <input
                name="minGuests"
                type="number"
                min={0}
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Maximum guests
              <input
                name="maxGuests"
                type="number"
                min={0}
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label flex-row items-center gap-2">
              <input name="isTemplate" type="checkbox" /> Reusable template
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
          </>
        ) : null}
      </div>
    </form>
  );
}
