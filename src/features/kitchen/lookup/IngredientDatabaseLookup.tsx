import { useEffect, useId, useRef, useState } from "react";
import {
  useIngredientLookupGetFoodAutofill,
  useIngredientLookupSearchFoods,
} from "../../../lib/ingredientLookupClient";
import { convexActionErrorMessage } from "../../../lib/convexActionErrorMessage";
import { canScaleNutritionToUnit } from "../../../lib/nutritionUnitScale";
import { useActionFailure } from "../../../ui/action-result";
import type {
  IngredientAutofillProfile,
  IngredientLookupApplyResult,
  IngredientLookupHit,
} from "./ExternalIngredientProfile";

type Props = Readonly<{
  onApply: (
    profile: IngredientAutofillProfile,
  ) => void | Promise<IngredientLookupApplyResult | void>;
  disabled?: boolean;
  label?: string;
  /** Catalog unit used to decide whether lookup nutrition can be stored. */
  catalogUnit?: string;
}>;

function nutritionStatusMessage(
  profile: IngredientAutofillProfile,
  applyResult: IngredientLookupApplyResult | void,
  catalogUnit?: string,
): string {
  if (applyResult?.nutritionSkippedReason) {
    return applyResult.nutritionSkippedReason;
  }
  const hasNutrition = Object.values(profile.nutrition).some(
    (value) => value != null && Number(value) > 0,
  );
  if (!hasNutrition) {
    return profile.nutritionNote;
  }
  if (applyResult?.nutritionApplied) {
    return applyResult.nutritionAppliedNote ?? profile.nutritionNote;
  }
  if (
    catalogUnit &&
    hasNutrition &&
    !canScaleNutritionToUnit(catalogUnit) &&
    !profile.servingGramsPerUnit &&
    !profile.gramsPerMl
  ) {
    return `Nutrition from the lookup was not applied — unit "${catalogUnit}" could not be scaled. Enter nutrition manually.`;
  }
  return profile.nutritionNote;
}

function imageStatusMessage(
  profile: IngredientAutofillProfile,
  applyResult: IngredientLookupApplyResult | void,
): string {
  if (applyResult?.imageApplied) {
    return "Product photo imported.";
  }
  if (applyResult && applyResult.imageApplied === false && profile.imageUrl) {
    return "Product photo could not be imported — upload manually if needed.";
  }
  if (profile.imageUrl && !applyResult) {
    return "Product photo will import when you save this ingredient.";
  }
  return profile.imageNote;
}

function costStatusMessage(
  profile: IngredientAutofillProfile,
  applyResult: IngredientLookupApplyResult | void,
): string {
  if (applyResult?.costNote) {
    return applyResult.costNote;
  }
  return profile.costNote;
}

/** Wait for a typing pause before hitting USDA/OFF — cuts typo partial searches. */
const SEARCH_DEBOUNCE_MS = 750;

/** Search USDA FoodData Central and apply autofill to a parent ingredient form. */
export function IngredientDatabaseLookup({
  onApply,
  disabled = false,
  label = "Search food database",
  catalogUnit,
}: Props) {
  const listId = useId();
  const searchFoods = useIngredientLookupSearchFoods();
  const getFoodAutofill = useIngredientLookupGetFoodAutofill();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IngredientLookupHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const [applied, setApplied] = useState<{
    profile: IngredientAutofillProfile;
    applyResult?: IngredientLookupApplyResult | void;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSearchRef = useRef(false);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchGenerationRef.current += 1;
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const generation = ++searchGenerationRef.current;
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          setError(null);
          const results = await searchFoods({ query: trimmed, limit: 10 });
          if (generation !== searchGenerationRef.current) return;
          setHits(results as IngredientLookupHit[]);
          if (document.activeElement?.id === `${listId}-query`) {
            setOpen(true);
          }
        } catch (cause) {
          if (generation !== searchGenerationRef.current) return;
          setError(
            convexActionErrorMessage(
              cause,
              "Could not search the food database",
            ),
          );
          setHits([]);
        } finally {
          if (generation === searchGenerationRef.current) {
            setSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchFoods, listId]);

  const selectHit = async (hit: IngredientLookupHit) => {
    setLoadingId(hit.externalId);
    setError(null);
    try {
      const profile = (await getFoodAutofill({
        externalId: hit.externalId,
        source: hit.source,
      })) as IngredientAutofillProfile;
      skipSearchRef.current = true;
      setQuery(profile.name);
      setOpen(false);
      const applyResult = await onApply(profile);
      setApplied({ profile, applyResult });
    } catch (cause) {
      setError(convexActionErrorMessage(cause, "Could not load food details"));
    } finally {
      setLoadingId(null);
    }
  };

  const nutritionMessage = applied
    ? nutritionStatusMessage(applied.profile, applied.applyResult, catalogUnit)
    : null;

  const costMessage = applied
    ? costStatusMessage(applied.profile, applied.applyResult)
    : null;

  const nutritionWarning =
    nutritionMessage?.startsWith("Nutrition") &&
    nutritionMessage.includes("not");

  return (
    <div className="space-y-2 rounded-sm border border-line bg-inset/40 p-3">
      <label className="field-label" htmlFor={`${listId}-query`}>
        {label}
        <input
          id={`${listId}-query`}
          className="input mt-1"
          value={query}
          disabled={disabled || loadingId != null}
          placeholder="Type an ingredient — e.g. chicken breast, olive oil…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={`${listId}-results`}
          onChange={(event) => {
            setQuery(event.target.value);
            setApplied(null);
          }}
          onFocus={() => {
            if (hits.length) setOpen(true);
          }}
        />
      </label>
      <p className="text-xs text-ink-3">
        USDA FoodData Central and Open Food Facts. Selecting a result fills
        name, category, nutrition, and allergens when label data is available.
        Cost imports automatically from Open Prices or similar items already in
        your catalog when a barcode or category match exists.
      </p>
      {searching ? (
        <p className="text-sm text-ink-2" role="status">
          Searching…
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {open && hits.length > 0 ? (
        <ul
          id={`${listId}-results`}
          className="max-h-52 space-y-1 overflow-y-auto rounded-xs border border-line bg-panel p-1"
          role="listbox"
        >
          {hits.map((hit) => (
            <li key={hit.externalId}>
              <button
                type="button"
                role="option"
                className="flex w-full flex-col rounded-xs px-2 py-2 text-left hover:bg-inset disabled:opacity-60"
                disabled={disabled || loadingId != null}
                onClick={() => void selectHit(hit)}
              >
                <span className="font-medium text-ink">{hit.name}</span>
                <span className="text-xs text-ink-3">
                  {hit.source === "open_food_facts"
                    ? "Open Food Facts"
                    : "USDA"}
                  {hit.category ? ` · ${hit.category}` : ""}
                  {hit.brandOwner ? ` · ${hit.brandOwner}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {applied && nutritionMessage ? (
        <p
          className={`rounded-xs border px-2 py-1.5 text-sm text-ink ${
            nutritionWarning
              ? "border-warn/40 bg-warn-soft"
              : "border-ok/30 bg-ok-soft"
          }`}
        >
          Applied <strong>{applied.profile.name}</strong> from{" "}
          {applied.profile.sourceLabel}. {nutritionMessage}{" "}
          {imageStatusMessage(applied.profile, applied.applyResult)}{" "}
          {costMessage} {applied.profile.allergenNote}
        </p>
      ) : null}
    </div>
  );
}
