import { useMemo, useState } from "react";
import { AllergenIconRow } from "./AllergenIconRow";
import {
  culinaryCanonicalMatcher,
  type CanonicalLike,
} from "./CulinaryCanonicalMatcher";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";

export type PickerDish = CanonicalLike & {
  description?: string | null;
  allergenSummary?: string[] | null;
  primaryImageStorageId?: string | null;
  editionNumber?: number | null;
};

type Props = {
  kind: "dish" | "ingredient";
  records: readonly PickerDish[];
  onSelect: (id: string) => void;
  onCreateNew: (name: string) => void;
  onCreateEdition?: (sourceId: string, name: string) => void;
  excludeIds?: readonly string[];
  label?: string;
};

/** Search-first picker with duplicate warnings and deliberate edition create. */
export function CulinaryRecordPicker({
  kind,
  records,
  onSelect,
  onCreateNew,
  onCreateEdition,
  excludeIds = [],
  label,
}: Props) {
  const [query, setQuery] = useState("");
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const matches = useMemo(
    () =>
      culinaryCanonicalMatcher
        .findNameMatches(records, query || " ", 12)
        .filter((row) => !excluded.has(row._id)),
    [excluded, query, records],
  );
  const exact = culinaryCanonicalMatcher.likelyDuplicate(records, query);

  return (
    <div className="space-y-3 rounded-xs border border-line bg-surface p-3">
      <label className="field-label">
        {label ?? `Search ${kind === "dish" ? "dishes" : "ingredients"}`}
        <input
          className="field-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Type a ${kind} name…`}
          autoComplete="off"
        />
      </label>
      {exact && !excluded.has(exact._id) ? (
        <p
          className="rounded-xs border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-ink"
          role="status"
        >
          Likely existing match: <strong>{exact.name}</strong>
          {exact.editionNumber != null
            ? ` (edition ${exact.editionNumber})`
            : ""}
          . Select it, create a new edition, or create a distinct record only if
          you intend a different item.
        </p>
      ) : null}
      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {(query.trim()
          ? matches
          : culinaryCanonicalMatcher
              .filterPickerCandidates(records)
              .filter((r) => !excluded.has(r._id))
              .slice(0, 12)
        ).map((row) => (
          <li
            key={row._id}
            className="flex flex-wrap items-center gap-3 border-b border-line/70 pb-2"
          >
            {kind === "dish" ? (
              <DishPrimaryImage
                storageId={row.primaryImageStorageId}
                alt={row.name}
                size="thumb"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{row.name}</p>
              <p className="text-[11px] text-ink-3">
                Edition {row.editionNumber ?? 1}
                {row.description ? ` · ${row.description.slice(0, 80)}` : ""}
              </p>
              {kind === "dish" ? (
                <AllergenIconRow codes={row.allergenSummary} className="mt-1" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onSelect(row._id)}
              >
                Select
              </button>
              {onCreateEdition ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onCreateEdition(row._id, row.name)}
                >
                  New edition
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!query.trim()}
        onClick={() => onCreateNew(query.trim())}
      >
        Create new {kind}
        {exact ? " anyway" : ""}
      </button>
    </div>
  );
}
