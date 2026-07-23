import { useEffect, useRef, useState } from "react";
import { type ReportSubjectArea, useSavedViews } from "./useSavedViews";

type Props<S> = {
  /** Stable key for this list page, e.g. "events" or "invoices". */
  pageKey: string;
  /** Nearest report subject area (required by the underlying entity). */
  subjectArea: ReportSubjectArea;
  /** The page's current serializable filter/sort/column state. */
  currentState: S;
  /** Apply a saved view's state back onto the page. */
  onApply: (state: S) => void;
};

/**
 * Saved-views control for a list page: pick a saved view to apply it, save the
 * current filters as a named view, star one as the per-user default, or delete.
 * The default view is applied once when the page opens.
 */
export function SavedViewsBar<S>({
  pageKey,
  subjectArea,
  currentState,
  onApply,
}: Props<S>) {
  const { ready, views, save, setDefault, remove } = useSavedViews<S>(
    pageKey,
    subjectArea,
  );
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedDefault = useRef(false);

  // Run a saved-view mutation, surfacing failures instead of a silent no-op.
  // (Persistence currently depends on the SavedReportDefinition.ownerId fix,
  // issue #24 — until it lands, saves report a clear error rather than vanish.)
  const guardedRun = async (work: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch {
      setError("Couldn't save your view. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Open the workspace on the user's default view exactly once.
  useEffect(() => {
    if (!ready || appliedDefault.current) return;
    appliedDefault.current = true;
    const fallback = views.find((v) => v.isDefault);
    if (fallback) {
      setSelected(fallback.id);
      onApply(fallback.state);
    }
  }, [ready, views, onApply]);

  const apply = (id: string) => {
    setSelected(id);
    const view = views.find((v) => v.id === id);
    if (view) onApply(view.state);
  };

  // ponytail: native prompt/confirm — the app has no lightweight text-input modal
  // and a name prompt does not warrant building one. Swap for an inline field if
  // the UX bar rises.
  const onSave = async () => {
    const name = window.prompt("Name this view")?.trim();
    if (!name) return;
    await guardedRun(() => save(name, currentState, views.length === 0));
  };

  const current = views.find((v) => v.id === selected) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input max-w-56"
        aria-label="Saved views"
        value={selected}
        onChange={(e) => apply(e.target.value)}
        disabled={busy}
      >
        <option value="">
          {views.length ? "Saved views…" : "No saved views"}
        </option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.isDefault ? "★ " : ""}
            {v.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onSave}
        disabled={busy}
      >
        Save view
      </button>
      {current ? (
        <>
          {!current.isDefault ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => guardedRun(() => setDefault(current.id))}
              disabled={busy}
            >
              Set default
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (!window.confirm(`Delete view “${current.name}”?`)) return;
              void guardedRun(async () => {
                await remove(current.id);
                setSelected("");
              });
            }}
            disabled={busy}
          >
            Delete
          </button>
        </>
      ) : null}
      {error ? (
        <span className="text-[12px] text-ink-3" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
