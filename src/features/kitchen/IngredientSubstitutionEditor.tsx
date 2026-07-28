import { useState } from "react";
import { formatMoneyExact } from "../../lib/format";
import { useIngredientConfigureSubstitutes } from "../../lib/manifest-convex-react";

type IngredientOption = {
  _id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  allergens?: readonly string[] | null;
  status: string;
  deletedAt?: number | null;
};

function allergenDelta(
  sourceAllergens: readonly string[],
  candidateAllergens: readonly string[],
) {
  const source = new Set(sourceAllergens);
  return candidateAllergens.filter((allergen) => !source.has(allergen));
}

function costDeltaLabel(delta: number, unit: string) {
  if (Math.abs(delta) < 0.005) return `Same cost / ${unit}`;
  return `${delta > 0 ? "+" : "−"}${formatMoneyExact(Math.abs(delta))} / ${unit}`;
}

export function IngredientSubstitutionEditor({
  ingredient,
  ingredients,
  onFailure,
}: {
  ingredient: IngredientOption & {
    version: number;
    substituteIngredientIds?: readonly string[] | null;
  };
  ingredients: readonly IngredientOption[] | undefined;
  onFailure: (error: unknown) => void;
}) {
  const configureSubstitutes = useIngredientConfigureSubstitutes();
  const initialIds = [...(ingredient.substituteIngredientIds ?? [])];
  const [selectedIds, setSelectedIds] = useState(initialIds);
  const [candidateId, setCandidateId] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredientById = new Map(
    (ingredients ?? []).map((candidate) => [candidate._id, candidate]),
  );
  const availableCandidates = (ingredients ?? []).filter(
    (candidate) =>
      candidate._id !== ingredient._id &&
      candidate.deletedAt == null &&
      candidate.status === "active" &&
      candidate.unit === ingredient.unit &&
      !selectedIds.includes(candidate._id),
  );
  const dirty = selectedIds.join("\u0000") !== initialIds.join("\u0000");

  const save = async () => {
    setSaving(true);
    onFailure(null);
    try {
      await configureSubstitutes({
        docId: ingredient._id,
        version: ingredient.version,
        substituteIngredientIds: selectedIds,
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
      aria-labelledby="ingredient-substitutes-heading"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">Shortage playbook</p>
          <h2 id="ingredient-substitutes-heading">Mapped substitutes</h2>
        </div>
        <span>{selectedIds.length} mapped</span>
      </div>
      <p className="max-w-160 text-[13px] text-ink-2">
        When this ingredient cannot cover component demand, the event menu ranks
        these alternatives by allergen compatibility and unit-cost impact.
      </p>

      {selectedIds.length ? (
        <ul
          className="mt-4 space-y-2"
          aria-label="Mapped ingredient substitutes"
        >
          {selectedIds.map((candidateId) => {
            const candidate = ingredientById.get(candidateId);
            const newAllergens = candidate
              ? allergenDelta(
                  ingredient.allergens ?? [],
                  candidate.allergens ?? [],
                )
              : [];
            return (
              <li
                key={candidateId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3"
              >
                <div className="min-w-48 flex-1">
                  <strong>{candidate?.name ?? "Unavailable ingredient"}</strong>
                  <p className="mt-1 text-[11px] text-ink-3">
                    {candidate
                      ? costDeltaLabel(
                          candidate.costPerUnit - ingredient.costPerUnit,
                          ingredient.unit,
                        )
                      : "Remove this unavailable mapping"}
                  </p>
                </div>
                {candidate ? (
                  <span
                    className={
                      newAllergens.length
                        ? "chip border-warn/30 bg-warn-soft text-warn"
                        : "chip border-ok/30 bg-ok-soft text-ok"
                    }
                  >
                    {newAllergens.length
                      ? `Adds ${newAllergens.join(", ")}`
                      : "No new allergens"}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={saving}
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.filter((id) => id !== candidateId),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="document-empty mt-4">
          <p>No substitutes mapped yet.</p>
          <span>Map same-unit ingredients so shortages come with options.</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-[12px] text-ink-2">
          Add substitute
          <select
            className="input"
            value={candidateId}
            disabled={
              saving || ingredients === undefined || !availableCandidates.length
            }
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">
              {ingredients === undefined
                ? "Loading ingredients…"
                : availableCandidates.length
                  ? `Choose an active ${ingredient.unit} ingredient`
                  : "No more same-unit ingredients available"}
            </option>
            {availableCandidates.map((candidate) => (
              <option key={candidate._id} value={candidate._id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving || !candidateId}
          onClick={() => {
            setSelectedIds((current) => [...current, candidateId]);
            setCandidateId("");
          }}
        >
          Add mapping
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save substitutes"}
        </button>
      </div>
    </section>
  );
}
