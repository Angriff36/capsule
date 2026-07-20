import type { FormEvent } from "react";
import { PACK_LIST_UNITS } from "./packListUnits";

interface PackListItemFormProps {
  dishes: Array<{ _id: string; name: string; deletedAt?: number | null }>;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PackListItemForm({
  dishes,
  busy,
  onSubmit,
}: PackListItemFormProps) {
  return (
    <form className="supply-form" onSubmit={onSubmit}>
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Load sheet line</p>
          <h2>Add pack item</h2>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add item"}
        </button>
      </div>
      <div className="supply-form-grid">
        <label className="field-label">
          Description
          <input
            name="description"
            className="input"
            placeholder="Chafing dishes"
            required
          />
        </label>
        <label className="field-label">
          Required quantity
          <input
            name="requiredQuantity"
            className="input"
            type="number"
            min="0.0001"
            step="any"
            required
          />
        </label>
        <label className="field-label">
          Unit
          <select name="unit" className="input" defaultValue="each">
            {PACK_LIST_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Dish (optional)
          <select name="dishId" className="input">
            <option value="">No dish</option>
            {dishes
              .filter((dish) => dish.deletedAt == null)
              .map((dish) => (
                <option key={dish._id} value={dish._id}>
                  {dish.name}
                </option>
              ))}
          </select>
        </label>
      </div>
    </form>
  );
}
