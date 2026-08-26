import { useState } from "react";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import type { IngredientCatalogRow } from "./IngredientCatalogLabel";

type Props = {
  ingredients: readonly IngredientCatalogRow[] | undefined;
  name?: string;
  required?: boolean;
  value?: string;
  onChange?: (ingredientId: string) => void;
};

/** Scrollable ingredient list with thumbnails for add-to-recipe forms. */
export function IngredientOptionPicker({
  ingredients,
  name = "ingredientId",
  required = false,
  value: controlledValue,
  onChange,
}: Props) {
  const [internalValue, setInternalValue] = useState("");
  const selectedId = controlledValue ?? internalValue;
  const rows = (ingredients ?? []).filter(
    (row) =>
      row.deletedAt == null && (row.status == null || row.status === "active"),
  );

  const pick = (id: string) => {
    if (onChange) onChange(id);
    else setInternalValue(id);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selectedId} required={required} />
      <ul
        className="max-h-48 space-y-1 overflow-y-auto rounded-xs border border-line bg-panel p-1"
        role="listbox"
        aria-label="Choose ingredient"
      >
        {rows.map((row) => {
          const selected = row._id === selectedId;
          return (
            <li key={row._id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left ${
                  selected
                    ? "bg-accent-soft ring-1 ring-accent"
                    : "hover:bg-inset"
                }`}
                onClick={() => pick(row._id)}
              >
                <DishPrimaryImage
                  storageId={row.primaryImageStorageId}
                  alt={row.name}
                  size="thumb"
                />
                <span className="truncate font-medium">{row.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length ? (
        <p className="text-sm text-ink-3">
          No active ingredients in the catalog.
        </p>
      ) : null}
    </div>
  );
}
