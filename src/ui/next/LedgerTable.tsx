import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./next.css";

/* ============================================================================
   LedgerTable — the working surface for every list in the app
   Capsule has `.th`/`.td` and nothing else: no selection, no sort, no grouping,
   no totals, no inline edit, no keyboard. This is the component those pages
   actually need.

   - sticky header and sticky totals row
   - checkbox selection with SHIFT range select and an indeterminate header box
   - group rows with per-group subtotals
   - a keyboard cursor (j/k or arrows, x to toggle, a to select all)
   - numeric columns right-aligned with tabular figures
   - any cell can render an InlineEdit
   ========================================================================== */

export interface LedgerColumn<T> {
  key: string;
  header: string;
  numeric?: boolean;
  width?: number | string;
  sortable?: boolean;
  /** Pull the sortable/summable primitive out of the row. */
  value?: (row: T) => number | string;
  render?: (row: T, index: number) => React.ReactNode;
  /** Show a subtotal for this column in group rows and the totals row. */
  total?: boolean;
}

export interface LedgerTableProps<T> {
  columns: LedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Group rows under a heading, with subtotals. */
  groupBy?: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  onRowActivate?: (row: T) => void;
  showTotals?: boolean;
  maxHeight?: number;
  /** Rendered sticky at the bottom when anything is selected. */
  bulkActions?: (selected: string[]) => React.ReactNode;
  empty?: React.ReactNode;
}

export function LedgerTable<T>({
  columns,
  rows,
  rowKey,
  groupBy,
  selectable = false,
  selected,
  onSelectedChange,
  onRowActivate,
  showTotals = false,
  maxHeight,
  bulkActions,
  empty,
}: LedgerTableProps<T>) {
  const [internal, setInternal] = useState<string[]>([]);
  const picked = selected ?? internal;
  const setPicked = onSelectedChange ?? setInternal;

  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [cursor, setCursor] = useState(0);
  const lastClicked = useRef<string | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const raw = useCallback((row: T, col: LedgerColumn<T>): number | string => {
    if (col.value) return col.value(row);
    const v = (row as Record<string, unknown>)[col.key];
    return typeof v === "number" ? v : String(v ?? "");
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = raw(a, col);
      const bv = raw(b, col);
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, sort, columns, raw]);

  /** Flat render order: group heading rows interleaved with data rows. */
  const lines = useMemo(() => {
    if (!groupBy) return sorted.map((row) => ({ type: "row" as const, row }));
    const out: (
      { type: "row"; row: T } | { type: "group"; label: string; rows: T[] }
    )[] = [];
    const groups = new Map<string, T[]>();
    for (const row of sorted) {
      const g = groupBy(row);
      groups.set(g, [...(groups.get(g) ?? []), row]);
    }
    for (const [label, list] of groups) {
      out.push({ type: "group", label, rows: list });
      for (const row of list) out.push({ type: "row", row });
    }
    return out;
  }, [sorted, groupBy]);

  const dataRows = useMemo(
    () =>
      lines
        .filter((l): l is { type: "row"; row: T } => l.type === "row")
        .map((l) => l.row),
    [lines],
  );

  const allIds = dataRows.map(rowKey);
  const allPicked = picked.length > 0 && picked.length === allIds.length;
  const somePicked = picked.length > 0 && !allPicked;

  const toggle = (index: number, shift: boolean) => {
    const id = rowKey(dataRows[index]);
    const anchor =
      lastClicked.current == null ? -1 : allIds.indexOf(lastClicked.current);
    if (shift && anchor >= 0) {
      const [a, b] = [anchor, index].sort((x, y) => x - y);
      const range = dataRows.slice(a, b + 1).map(rowKey);
      const add = !picked.includes(id);
      setPicked(
        add
          ? [...new Set([...picked, ...range])]
          : picked.filter((p) => !range.includes(p)),
      );
    } else {
      setPicked(
        picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id],
      );
      lastClicked.current = id;
    }
  };

  const sum = (list: T[], col: LedgerColumn<T>) =>
    list.reduce((acc, row) => {
      const v = raw(row, col);
      return acc + (typeof v === "number" ? v : 0);
    }, 0);

  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(dataRows.length - 1, c)));
  }, [dataRows.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed into an input, button or other control inside a cell belong
    // to that control, not to the table.
    if (
      e.target !== e.currentTarget &&
      (e.target as HTMLElement).closest(
        "input, textarea, select, button, a, [contenteditable]",
      )
    )
      return;
    const max = dataRows.length - 1;
    if (max < 0) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      setCursor((c) => Math.min(max, c + 1));
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "x" && selectable) {
      e.preventDefault();
      toggle(cursor, e.shiftKey);
    } else if (e.key === "a" && selectable) {
      e.preventDefault();
      setPicked(allPicked ? [] : allIds);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onRowActivate?.(dataRows[cursor]);
    } else if (e.key === "Escape") {
      setPicked([]);
    }
  };

  const totalCols = columns.filter((c) => c.total);

  return (
    <div className="cx cx-ledger-wrap">
      <div
        className="cx-ledger-scroll"
        style={
          maxHeight
            ? ({
                ["--cx-ledger-h" as string]: `${maxHeight}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <table
          className="cx-ledger"
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-multiselectable={selectable || undefined}
        >
          <thead>
            <tr>
              {selectable && (
                <th className="cx-cell-pick">
                  <input
                    type="checkbox"
                    className="cx-check"
                    aria-label="Select all rows"
                    checked={allPicked}
                    ref={(el) => {
                      if (el) el.indeterminate = somePicked;
                    }}
                    onChange={() => setPicked(allPicked ? [] : allIds)}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.numeric ? "num" : ""} ${c.sortable ? "sortable" : ""}`.trim()}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === 1
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  onClick={() =>
                    c.sortable &&
                    setSort((s) =>
                      s?.key === c.key
                        ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                        : { key: c.key, dir: 1 },
                    )
                  }
                >
                  {c.header}
                  {c.sortable && (
                    <span className="cx-sort">
                      {sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody ref={bodyRef}>
            {dataRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  style={{ height: 90 }}
                >
                  <div
                    style={{ textAlign: "center", color: "var(--color-ink-3)" }}
                  >
                    {empty ?? "Nothing in this view."}
                  </div>
                </td>
              </tr>
            )}

            {lines.map((line, i) => {
              if (line.type === "group") {
                return (
                  <tr key={`g-${line.label}-${i}`} className="cx-ledger-group">
                    <td colSpan={columns.length + (selectable ? 1 : 0)}>
                      {line.label}
                      {totalCols.length > 0 && (
                        <span className="cx-group-sum">
                          {line.rows.length} rows ·{" "}
                          {totalCols
                            .map(
                              (c) =>
                                `${c.header} ${sum(line.rows, c).toLocaleString()}`,
                            )
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }
              const index = dataRows.indexOf(line.row);
              const id = rowKey(line.row);
              const isPicked = picked.includes(id);
              return (
                <tr
                  key={id}
                  aria-selected={isPicked || undefined}
                  data-cursor={index === cursor || undefined}
                  onClick={() => setCursor(index)}
                  onDoubleClick={() => onRowActivate?.(line.row)}
                >
                  {selectable && (
                    <td className="cx-cell-pick">
                      <input
                        type="checkbox"
                        className="cx-check"
                        aria-label={`Select row ${index + 1}`}
                        checked={isPicked}
                        onChange={() => undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(index, e.shiftKey);
                        }}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? "num" : undefined}>
                      {c.render
                        ? c.render(line.row, index)
                        : String(raw(line.row, c))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {showTotals && dataRows.length > 0 && (
            <tfoot>
              <tr>
                {selectable && <td className="cx-cell-pick" />}
                {columns.map((c, i) => (
                  <td key={c.key} className={c.numeric ? "num" : undefined}>
                    {i === (selectable ? 0 : 0) && !c.total
                      ? `${dataRows.length} rows`
                      : c.total
                        ? sum(dataRows, c).toLocaleString()
                        : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {selectable && picked.length > 0 && (
        <BulkBar
          count={picked.length}
          total={allIds.length}
          onSelectAll={() => setPicked(allIds)}
          onClear={() => setPicked([])}
        >
          {bulkActions?.(picked)}
        </BulkBar>
      )}
    </div>
  );
}

/* ============================================================================
   BulkBar — appears only when there is a selection
   Shows the count, says explicitly whether "all" means this page or the whole
   result set, and keeps Clear always reachable on the right.
   ========================================================================== */

export function BulkBar({
  count,
  total,
  onSelectAll,
  onClear,
  children,
}: {
  count: number;
  total?: number;
  onSelectAll?: () => void;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="cx-bulk" role="region" aria-label="Bulk actions">
      <span className="cx-bulk-count">{count} selected</span>
      {total != null && count < total && onSelectAll && (
        <button
          className="cx-bulk-scope"
          onClick={onSelectAll}
          style={{ border: 0 }}
        >
          Select all {total}
        </button>
      )}
      {children}
      <button className="cx-bulk-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
