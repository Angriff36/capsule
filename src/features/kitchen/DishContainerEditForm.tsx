import { useState, type FormEvent } from "react";
import { useDishContainerRevise } from "../../lib/manifest-convex-react";
import { unitOptionsFor } from "./import/UnitOfMeasureMapper";

// Edit form for one existing DishContainer row. Every field of the revise
// command is sent, pre-filled with the saved value, because an omitted optional
// param clears what is stored.

export const SERVICE_METHODS = [
  { value: "cooked_on_site", label: "Cooked on site" },
  { value: "cooked_at_kitchen", label: "Cooked at kitchen" },
  { value: "brought_hot", label: "Brought hot" },
  { value: "cold_service", label: "Cold service" },
] as const;

export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(
  SERVICE_METHODS.map((method) => [method.value, method.label]),
);

export type DishContainerTarget = {
  _id: string;
  version: number;
  name: string;
  serviceMethod: string;
  servingsPerContainer: number;
  baseQuantity: number;
  unit: string;
  equipmentNotes?: string | null;
  handlingNotes?: string | null;
  sortOrder: number;
};

export function DishContainerEditForm({
  container,
  onSaved,
  onCancel,
  onError,
}: Readonly<{
  container: DishContainerTarget;
  onSaved: () => void;
  onCancel: () => void;
  onError: (message: string | null) => void;
}>) {
  const revise = useDishContainerRevise();
  const [name, setName] = useState(container.name);
  const [serviceMethod, setServiceMethod] = useState(
    String(container.serviceMethod),
  );
  const [servingsPerContainer, setServingsPerContainer] = useState(
    String(container.servingsPerContainer),
  );
  const [baseQuantity, setBaseQuantity] = useState(
    String(container.baseQuantity ?? 0),
  );
  const [unit, setUnit] = useState(String(container.unit));
  const [equipmentNotes, setEquipmentNotes] = useState(
    container.equipmentNotes ?? "",
  );
  const [handlingNotes, setHandlingNotes] = useState(
    container.handlingNotes ?? "",
  );
  const [sortOrder, setSortOrder] = useState(String(container.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);

  const servings = Number(servingsPerContainer);
  const canSave = name.trim().length > 0 && servings >= 1 && !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    onError(null);
    try {
      await revise({
        docId: container._id,
        version: container.version,
        name: name.trim(),
        serviceMethod,
        servingsPerContainer: Math.trunc(servings),
        baseQuantity: Math.trunc(Number(baseQuantity) || 0),
        unit,
        equipmentNotes: equipmentNotes.trim() || undefined,
        handlingNotes: handlingNotes.trim() || undefined,
        sortOrder: Math.trunc(Number(sortOrder) || 0),
      });
      onSaved();
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Could not save the container.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      <label className="field-label sm:col-span-2">
        <span>Container</span>
        <input
          className="input"
          value={name}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        <span>Service method</span>
        <select
          className="input"
          value={serviceMethod}
          disabled={saving}
          onChange={(event) => setServiceMethod(event.target.value)}
        >
          {SERVICE_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        <span>Servings per container</span>
        <input
          className="input"
          type="number"
          min={1}
          step="1"
          value={servingsPerContainer}
          disabled={saving}
          onChange={(event) => setServingsPerContainer(event.target.value)}
          required
        />
      </label>
      <label className="field-label">
        <span>Always send (extra)</span>
        <input
          className="input"
          type="number"
          min={0}
          step="1"
          value={baseQuantity}
          disabled={saving}
          onChange={(event) => setBaseQuantity(event.target.value)}
        />
      </label>
      <label className="field-label">
        <span>Unit</span>
        <select
          className="input"
          value={unit}
          disabled={saving}
          onChange={(event) => setUnit(event.target.value)}
        >
          {unitOptionsFor(String(container.unit)).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label sm:col-span-2">
        <span>Equipment notes</span>
        <input
          className="input"
          value={equipmentNotes}
          disabled={saving}
          onChange={(event) => setEquipmentNotes(event.target.value)}
          placeholder="2 chafers, 1 induction burner"
        />
      </label>
      <label className="field-label sm:col-span-2">
        <span>Handling notes</span>
        <input
          className="input"
          value={handlingNotes}
          disabled={saving}
          onChange={(event) => setHandlingNotes(event.target.value)}
          placeholder="Keep upright. Travels chilled."
        />
      </label>
      <label className="field-label">
        <span>Sort order</span>
        <input
          className="input"
          type="number"
          min={0}
          step="1"
          value={sortOrder}
          disabled={saving}
          onChange={(event) => setSortOrder(event.target.value)}
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          {saving ? "Saving…" : "Save container"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
