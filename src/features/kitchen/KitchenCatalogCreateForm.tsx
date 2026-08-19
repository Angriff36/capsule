import type { FormEvent } from "react";
import { SELECTABLE_UNITS } from "./import/UnitOfMeasureMapper";
import { KITCHEN_SECTION_SINGULAR, type KitchenSection } from "./kitchenRoutes";

const UNITS = SELECTABLE_UNITS;

function UnitField({ name, label }: { name: string; label: string }) {
  return (
    <label className="field-label">
      {label}
      <select name={name} className="input">
        {UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

type Props = {
  section: KitchenSection;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function KitchenCatalogCreateForm({ section, busy, onSubmit }: Props) {
  return (
    <form onSubmit={onSubmit} className="culinary-create-form">
      <div className="culinary-create-heading">
        <div>
          <p className="eyebrow">New record</p>
          <h2 className="font-display text-xl">
            Add {KITCHEN_SECTION_SINGULAR[section]}
          </h2>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      <div className="culinary-create-grid">
        <label className="field-label">
          Name
          <input name="name" className="input" required autoFocus />
        </label>
        {section === "ingredients" ? (
          <>
            <UnitField name="unit" label="Stock unit" />
            <label className="field-label">
              Cost per unit
              <input
                name="costPerUnit"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label sm:col-span-2">
              Allergens
              <input
                name="allergens"
                className="input"
                placeholder="milk, eggs, sesame"
              />
            </label>
          </>
        ) : null}
        {section === "components" ? (
          <>
            <label className="field-label">
              Yield
              <input
                name="yieldQuantity"
                type="number"
                min={1}
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <UnitField name="yieldUnit" label="Yield unit" />
            <label className="field-label">
              Batch multiplier
              <input
                name="batchMultiplier"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Cuisine
              <input name="cuisine" className="input" />
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
            <label className="field-label sm:col-span-2">
              Method
              <textarea name="instructions" className="input min-h-28 py-2" />
            </label>
          </>
        ) : null}
        {section === "dishes" ? (
          <>
            <label className="field-label">
              Portion size
              <input
                name="portionSize"
                type="number"
                min={0.01}
                step="0.01"
                defaultValue={1}
                className="input"
                required
              />
            </label>
            <UnitField name="portionUnit" label="Portion unit" />
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Course
              <input name="course" className="input" />
            </label>
            <label className="field-label">
              Service style
              <input name="serviceStyle" className="input" />
            </label>
            <label className="field-label sm:col-span-2">
              Dietary tags
              <input
                name="dietaryTags"
                className="input"
                placeholder="vegan, gluten-free"
              />
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
          </>
        ) : null}
        {section === "menus" ? (
          <>
            <label className="field-label">
              Category
              <input name="category" className="input" />
            </label>
            <label className="field-label">
              Base price
              <input
                name="basePrice"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Price per person
              <input
                name="pricePerPerson"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Minimum guests
              <input
                name="minGuests"
                type="number"
                min={0}
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label">
              Maximum guests
              <input
                name="maxGuests"
                type="number"
                min={0}
                defaultValue={0}
                className="input"
              />
            </label>
            <label className="field-label flex-row items-center gap-2">
              <input name="isTemplate" type="checkbox" /> Reusable template
            </label>
            <label className="field-label sm:col-span-2">
              Description
              <textarea name="description" className="input min-h-20 py-2" />
            </label>
          </>
        ) : null}
      </div>
    </form>
  );
}
