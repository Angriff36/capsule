import { Link } from "react-router-dom";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  formatCountNoun,
  formatDate,
  formatMoneyExact,
} from "../../lib/format";
import { PayrollLifecyclePolicy } from "./PayrollLifecyclePolicy";
import { roundPayrollHours } from "./payrollPeriod";
import { parseTipPayrollNote } from "./tipDistribution";

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
  notes?: unknown;
};

/**
 * Open payroll-input rows. Minutes come from the same clocked window as the
 * export preview so a prepared 0-minute row still shows the 5.00 h the
 * preview already counted.
 */
export function PayrollWorksheet({
  loading,
  visibleRows,
  countLabel,
  personName,
  clockedMinutesForInput,
  estimatedGross,
  busy,
  onPrepare,
  onInvoke,
}: {
  loading: boolean;
  visibleRows: readonly PayrollWorksheetRow[];
  /** Replaces the row count when only part of the history is loaded. */
  countLabel?: string;
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
        <span>{countLabel ?? formatCountNoun(visibleRows.length, "row")}</span>
      </div>
      {loading ? (
        <TableSkeleton rows={5} />
      ) : visibleRows.length === 0 ? (
        <div className="document-empty">
          <p>No open payroll inputs.</p>
          <span>
            Prepare a period rollup after time is logged in{" "}
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
                // Prepared minutes are what this input pays; clocked time
                // only fills in when none were entered.
                const prepared =
                  Number(row.regularMinutes ?? 0) +
                  Number(row.overtimeMinutes ?? 0);
                const payHours =
                  prepared > 0 ? roundPayrollHours(prepared) : clockedHours;
                const gross =
                  payHours == null
                    ? null
                    : estimatedGross(String(row.personId), payHours);
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
                      {payHours == null
                        ? String(row.totalMinutes ?? 0)
                        : `${payHours.toFixed(2)} h`}{" "}
                      <small>
                        ({String(row.regularMinutes ?? 0)} prepared reg /{" "}
                        {String(row.overtimeMinutes ?? 0)} prepared OT)
                      </small>
                      {gross == null ? null : (
                        <small>est. ${gross.toFixed(2)}</small>
                      )}
                      {(() => {
                        // A tip share sent from Tips carries its amount in the
                        // note; the export pays it, so the check shows it.
                        const tip = parseTipPayrollNote(row.notes);
                        return tip ? (
                          <small>
                            {" "}
                            tip {formatMoneyExact(tip.amountCents / 100)}
                          </small>
                        ) : null;
                      })()}
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
