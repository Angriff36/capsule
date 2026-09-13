import { useMemo } from "react";
import {
  missingStandardRows,
  type StandardCatalogRow,
} from "./catalogStandardOptions";

/**
 * One click registers every standard catering option this tenant is missing
 * (#368 item 5 — Occasion / Referral Source arrived completely empty, so
 * "Wedding" had nowhere to go until an admin hand-typed a catalog). Matches on
 * code, so re-clicking after a partial run only adds what is still absent.
 */
export function CatalogStandardListButton({
  singular,
  standardRows,
  existing,
  busy,
  onAdd,
}: {
  singular: string;
  standardRows: readonly StandardCatalogRow[];
  existing: ReadonlyArray<{ code: string }> | undefined;
  busy: boolean;
  onAdd: (rows: StandardCatalogRow[]) => void;
}) {
  const missing = useMemo(
    () => missingStandardRows(standardRows, existing),
    [standardRows, existing],
  );
  if (existing === undefined || missing.length === 0) return null;
  const preview = missing
    .slice(0, 4)
    .map((row) => row.name)
    .join(", ");
  const more = missing.length > 4 ? ` and ${missing.length - 4} more` : "";
  return (
    <div
      className="card flex flex-wrap items-center justify-between gap-3 border-line px-4 py-3"
      data-testid="catalog-standard-list"
    >
      <p className="min-w-0 flex-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">
          {missing.length} standard {singular}
          {missing.length === 1 ? "" : "s"} not added yet
        </span>{" "}
        — {preview}
        {more}. Add them all now; rename or retire any later.
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => onAdd(missing)}
        data-testid="catalog-standard-list-add"
      >
        {busy ? "Adding…" : "Add the standard list"}
      </button>
    </div>
  );
}
