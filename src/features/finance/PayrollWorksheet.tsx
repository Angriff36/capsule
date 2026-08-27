import { Link } from "react-router-dom";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate } from "../../lib/format";
import { PayrollLifecyclePolicy } from "./PayrollLifecyclePolicy";
import { roundPayrollHours } from "./payrollPeriod";

const policy = new PayrollLifecyclePolicy();

export type PayrollWorksheetRow = {
  _id: string;
  version: number;
  personId: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  totalMinutes?: unknown;
  regularMinutes?: unknown;
  overtimeMinutes?: unknown;
  status: unknown;
};

/**
 * Open payroll-input rows. Minutes come from the same clocked window as the
 * export preview so a prepared 0-minute row still shows the 5.00 h the
 * preview already counted.
 */
export function PayrollWorksheet({
  loading,
  visibleRows,
  personName,
  clockedMinutesForInput,
  estimatedGross,
  busy,
  onPrepare,
  onInvoke,
}: {
  loading: boolean;
  visibleRows: readonly PayrollWorksheetRow[];
  personName: (id: string) => string;
  clockedMinutesForInput: (row: {
    personId: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
  }) => number | null;
  estimatedGross: (personId: string, totalHours: number) => number | null;
  busy: string | null;
  onPrepare: () => void;
  onInvoke: (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => void;
}) {
  return (
    <section className="working-ledger">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Export worksheet</p>
          <h2>Payroll inputs</h2>
        </div>
        <span>{formatCountNoun(visibleRows.length, "row")}</span>
      </div>
      {loading ? (
        <TableSkeleton rows={5} />
      ) : visibleRows.length === 0 ? (
        <div className="document-empty">
          <p>No open payroll inputs.</p>
          <span>
            Prepare a period rollup after time is recorded in{" "}
            <Link className="text-link" to="/staff">
              Staff
            </Link>
            .
          </span>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onPrepare}
            >
              Prepare input
            </button>
          </div>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Minutes</th>
                <th>State</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const clocked = clockedMinutesForInput(row);
                const clockedHours =
                  clocked == null ? null : roundPayrollHours(clocked);
                const gross =
                  clockedHours == null
                    ? null
                    : estimatedGross(String(row.personId), clockedHours);
                return (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(String(row.personId))}</strong>
                      <small>
                        {row.periodStart
                          ? formatDate(Number(row.periodStart))
                          : "—"}{" "}
                        →{" "}
                        {row.periodEnd
                          ? formatDate(Number(row.periodEnd))
                          : "—"}
                      </small>
                    </td>
                    <td>
                      {clockedHours == null
                        ? String(row.totalMinutes ?? 0)
                        : `${clockedHours.toFixed(2)} h`}{" "}
                      <small>
                        ({String(row.regularMinutes ?? 0)} prepared reg /{" "}
                        {String(row.overtimeMinutes ?? 0)} prepared OT)
                      </small>
                      {gross == null ? null : (
                        <small>est. ${gross.toFixed(2)}</small>
                      )}
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .payrollActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => onInvoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
