import {
  CULINARY_ALLERGENS,
  type CulinaryAllergenCode,
} from "./CulinaryAllergenVocabulary";

type Props = Readonly<{
  allergens: readonly CulinaryAllergenCode[];
  isGlutenFree: boolean;
  onAllergensChange: (codes: CulinaryAllergenCode[]) => void;
  onGlutenFreeChange: (value: boolean) => void;
  disabled?: boolean;
  /** Sync hidden inputs for native form POST (catalog create). */
  formMode?: boolean;
  idPrefix?: string;
}>;

/** Clickable allergen flags plus gluten-free checkbox for ingredient forms. */
export function IngredientAllergenFieldset({
  allergens,
  isGlutenFree,
  onAllergensChange,
  onGlutenFreeChange,
  disabled = false,
  formMode = false,
  idPrefix = "ingredient-allergen",
}: Props) {
  const toggleAllergen = (code: CulinaryAllergenCode) => {
    if (allergens.includes(code)) {
      onAllergensChange(allergens.filter((item) => item !== code));
      return;
    }
    if (code === "wheat") {
      onGlutenFreeChange(false);
    }
    onAllergensChange([...allergens, code]);
  };

  const toggleGlutenFree = (checked: boolean) => {
    onGlutenFreeChange(checked);
  };

  return (
    <div className="space-y-3">
      {formMode ? (
        <>
          {allergens.map((code) => (
            <input key={code} type="hidden" name="allergens" value={code} />
          ))}
          {isGlutenFree ? (
            <input type="hidden" name="isGlutenFree" value="on" />
          ) : null}
        </>
      ) : null}

      <label
        className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-base ${
          isGlutenFree
            ? "border-ok/40 bg-ok-soft text-ink"
            : "border-line bg-panel text-ink"
        }`}
      >
        <input
          type="checkbox"
          id={`${idPrefix}-gluten-free`}
          checked={isGlutenFree}
          disabled={disabled}
          onChange={(event) => toggleGlutenFree(event.target.checked)}
        />
        Gluten free
      </label>

      <fieldset
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        disabled={disabled}
      >
        <legend className="mb-1 text-sm font-medium text-ink-2">
          Contains allergens
        </legend>
        {CULINARY_ALLERGENS.map((allergen) => {
          const checked = allergens.includes(allergen.code);
          return (
            <label
              key={allergen.code}
              className="flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-base"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleAllergen(allergen.code)}
              />
              {allergen.label}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

export function parseIngredientAllergensFromForm(data: FormData): {
  allergens: CulinaryAllergenCode[];
  isGlutenFree: boolean;
} {
  const allergens = data
    .getAll("allergens")
    .map((value) => String(value))
    .filter((value): value is CulinaryAllergenCode =>
      CULINARY_ALLERGENS.some((allergen) => allergen.code === value),
    );
  return {
    allergens,
    isGlutenFree: data.get("isGlutenFree") === "on",
  };
}
