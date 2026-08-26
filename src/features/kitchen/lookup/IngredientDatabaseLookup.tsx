import { useEffect, useId, useRef, useState } from "react";
import {
  useIngredientLookupGetFoodAutofill,
  useIngredientLookupSearchFoods,
} from "../../../lib/ingredientLookupClient";
import type {
  IngredientAutofillProfile,
  IngredientLookupHit,
} from "./ExternalIngredientProfile";

type Props = Readonly<{
  onApply: (profile: IngredientAutofillProfile) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}>;

/** Search USDA FoodData Central and apply autofill to a parent ingredient form. */
export function IngredientDatabaseLookup({
  onApply,
  disabled = false,
  label = "Search food database",
}: Props) {
  const listId = useId();
  const searchFoods = useIngredientLookupSearchFoods();
  const getFoodAutofill = useIngredientLookupGetFoodAutofill();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IngredientLookupHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<IngredientAutofillProfile | null>(
    null,
  );
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
            cause instanceof Error
              ? cause.message
              : "Could not search the food database",
          );
          setHits([]);
        } finally {
          if (generation === searchGenerationRef.current) {
            setSearching(false);
          }
        }
      })();
    }, 320);
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
      await onApply(profile);
      setApplied(profile);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load food details",
      );
    } finally {
      setLoadingId(null);
    }
  };

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
      {applied ? (
        <p className="rounded-xs border border-ok/30 bg-ok-soft px-2 py-1.5 text-sm text-ink">
          Applied <strong>{applied.name}</strong> from {applied.sourceLabel}.{" "}
          {applied.nutritionNote} {applied.allergenNote}
        </p>
      ) : null}
    </div>
  );
}
