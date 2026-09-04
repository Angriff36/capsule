import {
  formatTppDate,
  formatTppMoney,
  formatTppQuantity,
  displayCell,
} from "./formatters";
import type { TppColumn, TppRow, TppTotal } from "./types";

function cell(value: TppRow["values"][string], column: TppColumn): string {
  if (column.kind === "date" && typeof value === "number")
    return formatTppDate(value);
  if (column.kind === "money" && typeof value === "number")
    return formatTppMoney(value);
  if (
    (column.kind === "number" || column.kind === "quantity") &&
    typeof value === "number"
  )
    return formatTppQuantity(value);
  return displayCell(value ?? null);
}

export function TppReportTable({
  columns,
  rows,
  totals,
}: {
  columns: readonly TppColumn[];
  rows: readonly TppRow[];
  totals: readonly TppTotal[];
}) {
  return (
    <>
      <div className="tpp-result-scroll">
        <table className="data-table tpp-result-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key} data-kind={column.kind}>
                    {cell(row.values[column.key] ?? null, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totals.length ? (
        <dl className="tpp-total-strip">
          {totals.map((total) => (
            <div key={total.key}>
              <dt>{total.label}</dt>
              <dd>
                {total.kind === "money"
                  ? formatTppMoney(total.value)
                  : total.kind === "percentage"
                    ? `${formatTppQuantity(total.value)}%`
                    : formatTppQuantity(total.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
