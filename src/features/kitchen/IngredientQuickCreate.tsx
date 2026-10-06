import { useState } from "react";
import { useCreateIngredient } from "../../lib/manifest-convex-react";
import { classifyCommandFailure } from "../events/CommandFailure";
import {
  SELECTABLE_UNITS,
  type UnitOfMeasure,
} from "./import/UnitOfMeasureMapper";

/**
 * "+ New ingredient" inside a recipe-line picker. The fields carry no `name`,
 * so the surrounding line form never submits them; saving creates the
 * catalog row and hands its id back so the picker selects it in place.
 */
export function IngredientQuickCreate({
  initialName,
  onCreated,
}: {
  initialName: string;
  onCreated: (ingredient: { id: string; name: string }) => void;
}) {
  const createIngredient = useCreateIngredient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<UnitOfMeasure>("each");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid="ingredient-quick-create-open"
        onClick={() => {
          setName(initialName.trim());
          setError(null);
          setOpen(true);
        }}
      >
        + New ingredient
      </button>
    );
  }

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this ingredient a name.");
      return;
    }
    const costPerUnit = cost.trim() === "" ? 0 : Number(cost);
    if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
      setError("Cost can't be negative. Use zero or more.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = (await createIngredient({
        name: trimmed,
        unit,
        costPerUnit,
      })) as { docId: string };
      onCreated({ id: created.docId, name: trimmed });
      setOpen(false);
      setCost("");
    } catch (failure) {
      console.error("[ingredient-quick-create]", failure);
      const classified = classifyCommandFailure(failure);
      setError(
        classified.detail && classified.detail !== classified.title
          ? `${classified.title} ${classified.detail}`
          : classified.title,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-2 rounded-xs border border-line bg-inset p-2"
      data-testid="ingredient-quick-create"
    >
      <p className="text-sm font-semibold text-ink">New ingredient</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="field-label sm:col-span-3">
          Name
          <input
            className="input"
            value={name}
            autoFocus
            data-testid="ingredient-quick-create-name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Enter here must not submit the recipe line form.
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
        </label>
        <label className="field-label">
          Stock unit
          <select
            className="input"
            value={unit}
            onChange={(event) => setUnit(event.target.value as UnitOfMeasure)}
          >
            {SELECTABLE_UNITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label sm:col-span-2">
          Cost per unit (optional)
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={cost}
            placeholder="0.00"
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          data-testid="ingredient-quick-create-save"
          onClick={() => void save()}
        >
          {busy ? "Creating…" : "Create and select ingredient"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
