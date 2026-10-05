import { useEffect, useMemo, useState } from "react";
import { useStorageUrls } from "../../lib/fileStorageClient";
import {
  InlineReferenceCreateSheet,
  useCanCreateInlineReference,
} from "../../ui/InlineReferenceCreateSheet";
import type { IngredientCatalogRow } from "./IngredientCatalogLabel";

const THUMB_CLASS =
  "h-14 w-14 rounded-xs object-cover flex items-center justify-center border border-dashed border-line bg-inset text-xs text-ink-3";

type Props = {
  ingredients: readonly IngredientCatalogRow[] | undefined;
  name?: string;
  required?: boolean;
  value?: string;
  onChange?: (ingredientId: string) => void;
};

function IngredientPickerThumb({
  name,
  storageId,
  imageUrls,
}: {
  name: string;
  storageId?: string | null;
  imageUrls: Record<string, string | null> | undefined;
}) {
  if (!storageId) {
    return (
      <div className={THUMB_CLASS} role="img" aria-label={`${name} — no image`}>
        No image
      </div>
    );
  }
  if (imageUrls === undefined) {
    return (
      <div className={`animate-pulse bg-line/40 ${THUMB_CLASS}`} aria-hidden />
    );
  }
  const url = imageUrls[storageId];
  if (!url) {
    return (
      <div
        className={THUMB_CLASS}
        role="img"
        aria-label={`${name} — image unavailable`}
      >
        Unavailable
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className={`${THUMB_CLASS} border-0 object-cover`}
    />
  );
}

/** Scrollable ingredient list with thumbnails for add-to-recipe forms. */
export function IngredientOptionPicker({
  ingredients,
  name = "ingredientId",
  required = false,
  value: controlledValue,
  onChange,
}: Props) {
  const [internalValue, setInternalValue] = useState("");
  const [filter, setFilter] = useState("");
  const [createName, setCreateName] = useState<string | null>(null);
  const [temporaryIngredient, setTemporaryIngredient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const canCreateIngredient = useCanCreateInlineReference("ingredient");
  const selectedId = controlledValue ?? internalValue;
  const rows = useMemo(
    () =>
      (ingredients ?? []).filter(
        (row) =>
          row.deletedAt == null &&
          (row.status == null || row.status === "active"),
      ),
    [ingredients],
  );
  const allRows = useMemo(() => {
    if (
      !temporaryIngredient ||
      rows.some((row) => row._id === temporaryIngredient.id)
    )
      return rows;
    return [
      ...rows,
      { _id: temporaryIngredient.id, name: temporaryIngredient.name },
    ];
  }, [rows, temporaryIngredient]);
  const filteredRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return allRows;
    return allRows.filter((row) => row.name.toLowerCase().includes(query));
  }, [allRows, filter]);
  const storageIds = useMemo(
    () =>
      filteredRows
        .map((row) => row.primaryImageStorageId)
        .filter((id): id is string => Boolean(id)),
    [filteredRows],
  );
  const imageUrls = useStorageUrls(storageIds);

  const pick = (id: string) => {
    if (onChange) onChange(id);
    else setInternalValue(id);
  };

  useEffect(() => {
    const form = document
      .querySelector(`input[name="${name}"]`)
      ?.closest("form");
    if (!form || onChange) return;
    const resetSelection = () => {
      setInternalValue("");
      setFilter("");
    };
    form.addEventListener("reset", resetSelection);
    return () => form.removeEventListener("reset", resetSelection);
  }, [name, onChange]);

  return (
    <div className="space-y-2">
      <select
        className="sr-only"
        name={name}
        value={selectedId}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => pick(event.target.value)}
      >
        <option value="">Select ingredient</option>
        {allRows.map((row) => (
          <option key={row._id} value={row._id}>
            {row.name}
          </option>
        ))}
      </select>
      <label className="field-label">
        Filter ingredients
        <input
          className="input mt-1"
          value={filter}
          placeholder="Type to narrow the list…"
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <ul
        className="max-h-48 space-y-1 overflow-y-auto rounded-xs border border-line bg-panel p-1"
        role="listbox"
        aria-label="Choose ingredient"
      >
        {filteredRows.map((row) => {
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
                <IngredientPickerThumb
                  name={row.name}
                  storageId={row.primaryImageStorageId}
                  imageUrls={imageUrls}
                />
                <span className="truncate font-medium">{row.name}</span>
              </button>
            </li>
          );
        })}
        {filteredRows.length === 0 && filter.trim() && canCreateIngredient ? (
          <li>
            <button
              type="button"
              className="w-full rounded-xs px-2 py-2 text-left text-sm font-semibold text-brand hover:bg-accent-soft"
              onClick={() => setCreateName(filter.trim())}
            >
              + Create ingredient “{filter.trim()}”
            </button>
          </li>
        ) : null}
      </ul>
      {!rows.length ? (
        <p className="text-sm text-ink-3">
          No active ingredients in the catalog.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-ink-3">No ingredients match that filter.</p>
      ) : null}
      {createName ? (
        <InlineReferenceCreateSheet
          kind="ingredient"
          open
          initialName={createName}
          existingOptions={allRows.map((row) => ({
            id: row._id,
            label: row.name,
          }))}
          onClose={() => setCreateName(null)}
          onUseExisting={(id) => {
            pick(id);
            setCreateName(null);
          }}
          onCreated={(record) => {
            setTemporaryIngredient({ id: record.id, name: record.label });
            pick(record.id);
            setFilter("");
            setCreateName(null);
          }}
        />
      ) : null}
    </div>
  );
}
