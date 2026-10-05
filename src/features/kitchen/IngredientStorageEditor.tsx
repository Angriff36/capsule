import { useState, type FormEvent } from "react";
import { useIngredientSetStorage } from "../../lib/manifest-convex-react";

export type IngredientStorageTarget = {
  _id: string;
  version: number;
  shelfLifeDays?: number | null;
  storageInstructions?: string | null;
};

/** "Keeps 5 days" or "Shelf life not on file"; zero days is a real value. */
export function ingredientShelfLifeLabel(days: number | null | undefined) {
  if (days == null) return "Shelf life not on file";
  return days === 1 ? "Keeps 1 day" : `Keeps ${days} days`;
}

/**
 * How long the product keeps once received and how to store it. A blank field
 * is saved as "not on file", never as zero days or "no special storage".
 */
export function IngredientStorageEditor({
  ingredient,
  onFailure,
}: {
  ingredient: IngredientStorageTarget;
  onFailure: (error: unknown) => void;
}) {
  const setStorage = useIngredientSetStorage();
  const [busy, setBusy] = useState(false);
  const savedDays = ingredient.shelfLifeDays ?? null;
  const savedStorage = ingredient.storageInstructions?.trim() || null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const daysRaw = String(data.get("shelfLifeDays") ?? "").trim();
    const days = Number(daysRaw);
    const storage = String(data.get("storageInstructions") ?? "").trim();
    if (daysRaw !== "" && (!Number.isFinite(days) || days < 0)) return;
    void (async () => {
      onFailure(null);
      setBusy(true);
      try {
        await setStorage({
          docId: ingredient._id,
          version: ingredient.version,
          ...(daysRaw !== "" ? { shelfLifeDays: Math.round(days) } : {}),
          ...(storage ? { storageInstructions: storage } : {}),
        });
      } catch (error) {
        onFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="culinary-section" aria-label="Shelf life and storage">
      <div className="culinary-section-heading">
        <h2>Shelf life and storage</h2>
        <span data-testid="ingredient-shelf-life">
          {ingredientShelfLifeLabel(savedDays)}
        </span>
      </div>
      <p className="text-base" data-testid="ingredient-storage">
        {savedStorage ?? (
          <span className="text-ink-3">How to store it: not on file</span>
        )}
      </p>
      <form className="culinary-line-form" onSubmit={submit}>
        <label className="field-label">
          Shelf life (days)
          <input
            name="shelfLifeDays"
            type="number"
            min={0}
            step={1}
            className="input"
            placeholder="Not on file"
            defaultValue={savedDays ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          How to store it
          <input
            name="storageInstructions"
            className="input"
            placeholder="For example: walk-in, 34–38°F, keep covered"
            defaultValue={savedStorage ?? ""}
          />
        </label>
        <button className="btn btn-primary self-end" disabled={busy}>
          {busy ? "Saving…" : "Save storage"}
        </button>
      </form>
    </section>
  );
}
