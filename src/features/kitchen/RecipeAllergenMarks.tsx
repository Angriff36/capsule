import { useState, type FormEvent } from "react";
import { useComponentSetDeclaredAllergens } from "../../lib/manifest-convex-react";
import { CULINARY_ALLERGENS } from "./CulinaryAllergenVocabulary";

/**
 * Allergens marked on the recipe itself (the recipe sheet's "x" marks). They
 * add to what the ingredients carry and show on every dish that uses the
 * recipe; clearing a mark never hides an ingredient's allergen.
 */
export function RecipeAllergenMarks({
  component,
  onFailure,
}: {
  component: {
    _id: string;
    version: number;
    declaredAllergens?: readonly string[] | null;
  };
  onFailure: (error: unknown) => void;
}) {
  const setMarks = useComponentSetDeclaredAllergens();
  const [busy, setBusy] = useState(false);
  const marked = new Set(component.declaredAllergens ?? []);
  const labels = CULINARY_ALLERGENS.filter((allergen) =>
    marked.has(allergen.code),
  ).map((allergen) => allergen.label);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const codes = CULINARY_ALLERGENS.map((a) => a.code).filter((code) =>
      data.has(code),
    );
    void (async () => {
      onFailure(null);
      setBusy(true);
      try {
        await setMarks({
          docId: component._id,
          version: component.version,
          declaredAllergens: codes,
        });
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section
      className="culinary-section"
      aria-label="Allergens marked on this recipe"
      data-testid="recipe-allergen-marks"
    >
      <div className="culinary-section-heading">
        <h2>Allergens marked on this recipe</h2>
        <span>{labels.length ? labels.join(", ") : "None marked"}</span>
      </div>
      <p className="text-sm text-ink-3">
        These add to the allergens of the ingredients and show on every dish
        that uses this recipe.
      </p>
      <details className="recipe-add-editor">
        <summary>Edit marks</summary>
        <form
          key={`marks:${component._id}:${component.version}`}
          className="culinary-create-grid"
          onSubmit={submit}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2 sm:col-span-2">
            {CULINARY_ALLERGENS.map((allergen) => (
              <label
                key={allergen.code}
                className="inline-flex min-h-11 items-center gap-2"
              >
                <input
                  type="checkbox"
                  name={allergen.code}
                  defaultChecked={marked.has(allergen.code)}
                />
                {allergen.label}
              </label>
            ))}
          </div>
          <button className="btn btn-primary self-end" disabled={busy}>
            {busy ? "Saving…" : "Save marks"}
          </button>
        </form>
      </details>
    </section>
  );
}
