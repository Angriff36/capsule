import { type ReactNode, useCallback, useMemo, useState } from "react";

/**
 * Checkbox multi-select for list pages. Selection is keyed by `_id` and is
 * intersected against the current selectable rows every render, so a row that
 * changes status (and drops out of the selectable set) silently leaves the
 * selection. ponytail: plain Set, no reducer — four callers don't need one.
 */
export function useBulkSelection<T extends { _id: string }>(selectable: T[]) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const selectableIds = useMemo(
    () => selectable.map((row) => row._id),
    [selectable],
  );
  const selected = useMemo(
    () => selectable.filter((row) => ids.has(row._id)),
    [selectable, ids],
  );
  const allSelected =
    selectable.length > 0 && selected.length === selectable.length;

  const toggle = useCallback((id: string, on: boolean) => {
    setIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(
    (on: boolean) => setIds(on ? new Set(selectableIds) : new Set()),
    [selectableIds],
  );
  const clear = useCallback(() => setIds(new Set()), []);

  return {
    selected,
    count: selected.length,
    isSelected: (id: string) => ids.has(id),
    toggle,
    toggleAll,
    allSelected,
    clear,
  };
}

export type BulkProgress = { done: number; total: number } | null;

/**
 * Runs an async action over selected rows one at a time, publishing progress
 * for the action bar. Errors propagate to the caller's existing failure
 * handling; progress always clears in `finally`.
 */
export function useBulkRun() {
  const [progress, setProgress] = useState<BulkProgress>(null);
  const runBulk = useCallback(
    async <T,>(items: T[], work: (item: T) => Promise<void>) => {
      if (items.length === 0) return;
      setProgress({ done: 0, total: items.length });
      try {
        let done = 0;
        for (const item of items) {
          await work(item);
          done += 1;
          setProgress({ done, total: items.length });
        }
      } finally {
        setProgress(null);
      }
    },
    [],
  );
  return { progress, runBulk };
}

/** Sticky bar shown while rows are selected; hosts caller-provided actions. */
export function BulkActionBar({
  count,
  noun,
  progress,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  progress: BulkProgress;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0 && !progress) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
      role="region"
      aria-label="Bulk actions"
    >
      <div className="card flex flex-wrap items-center gap-3 border-line bg-panel px-4 py-3 shadow-lg">
        <span className="text-[13px] font-semibold text-ink">
          {count} {noun}
          {count === 1 ? "" : "s"} selected
        </span>
        {progress ? (
          <span className="text-[12px] text-ink-2" aria-live="polite">
            Working… {progress.done}/{progress.total}
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">{children}</div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClear}
          disabled={progress != null}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
