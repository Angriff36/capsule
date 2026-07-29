import React from "react";
import { clsx } from "@/lib/utils";
import { formatMoney, formatCount, formatDate } from "@/lib/format";

/** Convert a date-ish value to epoch millis, mirroring the date column display. */
function dateToMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return NaN;
}

/**
 * TableDisplay Component
 *
 * Displays tabular data for reports with sorting and export support.
 * Used for detailed breakdowns in dashboards.
 *
 * Features:
 * - Automatic formatting based on column type
 * - Sortable columns
 * - Responsive design
 * - Export to CSV support
 */

export interface TableColumn {
  key: string;
  header: string;
  type?: "string" | "number" | "currency" | "percent" | "date";
  align?: "left" | "center" | "right";
  sortable?: boolean;
  format?: (value: unknown) => string;
}

export interface TableDisplayProps {
  columns: TableColumn[];
  data: Array<Record<string, unknown>>;
  title?: string;
  subtitle?: string;
  height?: number;
  sortable?: boolean;
  onExport?: () => void;
  className?: string;
}

export function TableDisplay({
  columns,
  data,
  title,
  subtitle,
  height,
  sortable = false,
  onExport,
  className,
}: TableDisplayProps) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "asc",
  );

  const formatValue = (value: unknown, column: TableColumn): string => {
    if (value === null || value === undefined) return "—";

    if (column.format) return column.format(value);

    switch (column.type) {
      case "currency":
        return formatMoney(Number(value));
      case "percent":
        return `${Number(value).toFixed(1)}%`;
      case "number":
        return formatCount(Number(value));
      case "date": {
        const dateVal = dateToMillis(value);
        return formatDate(isNaN(dateVal) ? null : dateVal);
      }
      default:
        return String(value);
    }
  };

  const handleSort = (key: string) => {
    if (!sortable) return;

    if (sortColumn === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(key);
      setSortDirection("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortColumn || !sortable) return data;

    const column = columns.find((c) => c.key === sortColumn);
    const numericType =
      column?.type === "number" ||
      column?.type === "currency" ||
      column?.type === "percent";
    const dateType = column?.type === "date";

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      // Empty/null/undefined values sort last regardless of direction.
      if (aVal == null || aVal === "") return 1;
      if (bVal == null || bVal === "") return -1;

      let comparison: number;
      if (numericType || dateType) {
        const aKey = dateType ? dateToMillis(aVal) : Number(aVal);
        const bKey = dateType ? dateToMillis(bVal) : Number(bVal);
        comparison = aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
      } else {
        const aStr = String(aVal);
        const bStr = String(bVal);
        comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, sortable, columns]);

  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  } as const;

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-lg border border-line bg-panel",
        className,
      )}
    >
      {(title || subtitle || onExport) && (
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-ink">{title}</h3>
            )}
            {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
          </div>
          {onExport && (
            <button
              onClick={onExport}
              className="rounded border border-line-2 px-3 py-1.5 text-sm text-ink-2 hover:bg-inset"
            >
              Export CSV
            </button>
          )}
        </div>
      )}

      <div style={{ height }} className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-inset">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={clsx(
                    "px-4 py-2 font-medium text-ink-2",
                    alignClass[col.align || "left"],
                    sortable && col.sortable && "cursor-pointer hover:bg-inset",
                  )}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {sortable && col.sortable && (
                      <span className="text-ink-3">
                        {sortColumn === col.key
                          ? sortDirection === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedData.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-inset/50">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "px-4 py-2 text-ink-2",
                      alignClass[col.align || "left"],
                    )}
                  >
                    {formatValue(row[col.key], col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <div className="px-4 py-8 text-center text-ink-3">
          <p>No data available</p>
        </div>
      )}
    </div>
  );
}
