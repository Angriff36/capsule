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

export class BulkRunFailure extends Error {
  constructor(
    public readonly cause: unknown,
    public readonly completed: number,
    public readonly failed: number,
    public readonly remaining: number,
    public readonly completedItems: readonly unknown[],
    public readonly unfinishedItems: readonly unknown[],
  ) {
    super(`${completed} completed, ${failed} failed, ${remaining} remaining`);
    this.name = "BulkRunFailure";
  }
}

export async function runBulkItems<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>,
  onProgress?: (done: number) => void,
) {
  let completed = 0;
  for (const item of items) {
    try {
      await work(item);
      completed += 1;
      onProgress?.(completed);
    } catch (cause) {
      throw new BulkRunFailure(
        cause,
        completed,
        1,
        items.length - completed - 1,
        items.slice(0, completed),
        items.slice(completed),
      );
    }
  }
}

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
        await runBulkItems(items, work, (done) =>
          setProgress({ done, total: items.length }),
        );
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
        <span className="text-base font-semibold text-ink">
          {count} {noun}
          {count === 1 ? "" : "s"} selected
        </span>
        {progress ? (
          <span className="text-sm text-ink-2" aria-live="polite">
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
