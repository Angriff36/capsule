import { useMemo, useState } from "react";
import { AllergenIconRow } from "./AllergenIconRow";
import {
  culinaryCanonicalMatcher,
  type CanonicalLike,
} from "./CulinaryCanonicalMatcher";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { versionTabLabel, versionsByMain } from "./dishVersions";

export type PickerDish = CanonicalLike & {
  description?: string | null;
  allergenSummary?: string[] | null;
  primaryImageStorageId?: string | null;
  editionNumber?: number | null;
  versionOfDishId?: string | null;
  versionLabel?: string | null;
};

type Props = {
  kind: "dish" | "ingredient";
  records: readonly PickerDish[];
  onSelect: (id: string) => void;
  /** Leave out to hide the "Create new" button. */
  onCreateNew?: (name: string) => void;
  onCreateEdition?: (sourceId: string, name: string) => void;
  excludeIds?: readonly string[];
  label?: string;
};

/**
 * Search-first picker with duplicate warnings and deliberate edition create.
 * Dishes show as main dishes only; a main dish with versions asks which
 * version to pick, and searching a version's name finds its main dish.
 */
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
  const versions = useMemo(() => versionsByMain(records), [records]);
  const choices = (row: PickerDish) =>
    [row, ...(versions.get(row._id) ?? [])].filter(
      (choice) => !excluded.has(choice._id),
    );
  const mainOf = useMemo(() => {
    const byVersion = new Map<string, PickerDish>();
    for (const [mainId, list] of versions) {
      const main = records.find((row) => row._id === mainId);
      if (main) for (const version of list) byVersion.set(version._id, main);
    }
    return (row: PickerDish) => byVersion.get(row._id) ?? row;
  }, [records, versions]);
  const asMains = (rows: readonly PickerDish[]) =>
    [...new Map(rows.map((row) => [mainOf(row)._id, mainOf(row)])).values()]
      .filter((row) => choices(row).length > 0)
      .slice(0, 12);
  const nameMatches = useMemo(
    () => culinaryCanonicalMatcher.findNameMatches(records, query || " ", 40),
    [query, records],
  );
  const matches = asMains(nameMatches);
  const exact = culinaryCanonicalMatcher.likelyDuplicate(records, query);

  return (
    <div className="space-y-3 rounded-xs border border-line bg-panel p-3">
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
          className="rounded-xs border border-warn/40 bg-warn/10 px-2 py-1.5 text-sm text-ink"
          role="status"
        >
          Likely existing match: <strong>{exact.name}</strong>
          {exact.editionNumber != null
            ? ` (edition ${exact.editionNumber})`
            : ""}
          . Select it, create a new edition, or create a separate item only if
          you intend a different item.
        </p>
      ) : null}
      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {(query.trim()
          ? matches
          : asMains(culinaryCanonicalMatcher.filterPickerCandidates(records))
        ).map((row) => (
          <li
            key={row._id}
            className="flex flex-wrap items-center gap-3 border-b border-line/70 pb-2"
          >
            {kind === "dish" || kind === "ingredient" ? (
              <DishPrimaryImage
                storageId={row.primaryImageStorageId}
                alt={row.name}
                size="thumb"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-medium">{row.name}</p>
              <p className="text-xs text-ink-3">
                Edition {row.editionNumber ?? 1}
                {row.description ? ` · ${row.description.slice(0, 80)}` : ""}
              </p>
              {kind === "dish" ? (
                <AllergenIconRow codes={row.allergenSummary} className="mt-1" />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {versions.has(row._id) ? (
                <>
                  <span className="text-xs text-ink-3">Pick a version:</span>
                  {choices(row).map((choice) => (
                    <button
                      key={choice._id}
                      type="button"
                      className="btn btn-primary"
                      onClick={() => onSelect(choice._id)}
                    >
                      {versionTabLabel(choice)}
                    </button>
                  ))}
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onSelect(row._id)}
                >
                  Select
                </button>
              )}
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
      {onCreateNew ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!query.trim()}
          onClick={() => onCreateNew(query.trim())}
        >
          Create new {kind}
          {exact ? " anyway" : ""}
        </button>
      ) : null}
    </div>
  );
}
