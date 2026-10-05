import type { FormEvent } from "react";
import { IngredientOptionPicker } from "../kitchen/IngredientOptionPicker";

export const DEMAND_UNITS = [
  "each",
  "gram",
  "kilogram",
  "ounce",
  "pound",
  "milliliter",
  "liter",
  "teaspoon",
  "tablespoon",
  "cup",
  "pint",
  "quart",
  "gallon",
  "portion",
] as const;
type Props = {
  events: any[] | undefined;
  ingredients: any[] | undefined;
  workingId: string | null | undefined;
  busy: boolean;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function DemandLedgerCreateForm({
  events,
  ingredients,
  workingId,
  busy,
  submitting,
  onSubmit,
}: Props) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">By hand</p>
          <h2>Add a line the dishes do not cover</h2>
          <p className="mt-1 text-sm text-ink-2">
            For something an event needs that no dish lists, such as ice or a
            supply item. Pick the event, the product and the amount.
          </p>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {submitting ? "Adding." : "Add line"}
        </button>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Event
          <select
            key={events?.length ? "events-ready" : "events-loading"}
            name="eventId"
            className="input"
            defaultValue={workingId ?? ""}
            required
          >
            <option value="">Select event</option>
            {(events ?? [])
              .filter((item) => item.deletedAt == null)
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <label className="field-label sm:col-span-2">
          Ingredient
          <div className="mt-1">
            <IngredientOptionPicker ingredients={ingredients} required />
          </div>
        </label>
        <label className="field-label">
          Required quantity
          <input
            name="requiredQuantity"
            className="input"
            type="number"
            min={0.0001}
            step="any"
            required
          />
        </label>
        <label className="field-label">
          Unit
          <select name="unit" className="input">
            {DEMAND_UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
