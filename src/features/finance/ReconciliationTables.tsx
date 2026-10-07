import { formatDate, formatMoneyExact } from "../../lib/format";
import {
  RECONCILIATION_RESULT_LABEL,
  type FinanceReconciliationReport,
} from "../../lib/financeReconciliation";

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  return currency === "USD"
    ? formatMoneyExact(value)
    : `${value.toFixed(2)} ${currency}`;
}

/**
 * The money check itself (AC-093): month totals, the same totals split by
 * result, and every line that does not agree with the ids to look it up.
 * Used live on the finance page and for a saved copy on the reports page.
 */
export function ReconciliationTables({
  report,
  paymentLabel,
}: Readonly<{
  report: FinanceReconciliationReport;
  /** The invoice a payment was for, in words; the id when not given. */
  paymentLabel?: (paymentId: string) => string | undefined;
}>) {
  if (report.periods.length === 0) {
    return (
      <div className="document-empty">
        <p>No money in this window.</p>
        <span>
          Import old payments, or widen the dates, to compare them with Capsule.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Totals by month">
        <h2 className="text-base font-medium text-ink">Totals by month</h2>
        <div className="supply-table-wrap">
          <table className="supply-table" data-testid="recon-periods">
            <thead>
              <tr>
                <th>Month</th>
                <th>Currency</th>
                <th>Old system</th>
                <th>Capsule</th>
                <th>Difference</th>
                <th>Left out</th>
              </tr>
            </thead>
            <tbody>
              {report.periods.map((row) => (
                <tr key={`${row.period}|${row.currency}`}>
                  <td>{row.period}</td>
                  <td>{row.currency}</td>
                  <td>{money(row.sourceTotal, row.currency)}</td>
                  <td>{money(row.ledgerTotal, row.currency)}</td>
                  <td
                    className={row.difference === 0 ? "text-ok" : "text-danger"}
                  >
                    {money(row.difference, row.currency)}
                  </td>
                  <td>
                    {row.excludedCount > 0
                      ? `${row.excludedCount} rows · ${money(row.excludedTotal, row.currency)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Totals by result">
        <h2 className="text-base font-medium text-ink">Totals by result</h2>
        <div className="supply-table-wrap">
          <table className="supply-table" data-testid="recon-groups">
            <thead>
              <tr>
                <th>Month</th>
                <th>Currency</th>
                <th>Result</th>
                <th>Rows</th>
                <th>Old system</th>
                <th>Capsule</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((row) => (
                <tr key={`${row.period}|${row.currency}|${row.result}`}>
                  <td>{row.period}</td>
                  <td>{row.currency}</td>
                  <td>{RECONCILIATION_RESULT_LABEL[row.result]}</td>
                  <td>{row.count}</td>
                  <td>{money(row.sourceTotal, row.currency)}</td>
                  <td>{money(row.ledgerTotal, row.currency)}</td>
                  <td>{money(row.difference, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Rows that do not agree">
        <h2 className="text-base font-medium text-ink">
          Rows that do not agree ({report.discrepancies.length})
        </h2>
        {report.discrepancies.length === 0 ? (
          <p className="text-base text-ok">
            Every row agrees. {report.matchedCount} matched.
          </p>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table" data-testid="recon-discrepancies">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Result</th>
                  <th>Old row</th>
                  <th>Capsule payment</th>
                  <th>Old system</th>
                  <th>Capsule</th>
                  <th>Money date</th>
                  <th>Imported</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {report.discrepancies.map((line) => (
                  <tr key={line.key}>
                    <td>{line.period}</td>
                    <td>{RECONCILIATION_RESULT_LABEL[line.result]}</td>
                    <td title={line.sourceRowId ?? undefined}>
                      {line.externalId ?? "—"}
                    </td>
                    <td title={line.paymentId ?? undefined}>
                      {line.paymentId
                        ? (paymentLabel?.(line.paymentId) ?? line.paymentId)
                        : "—"}
                    </td>
                    <td>{money(line.sourceAmount, line.currency)}</td>
                    <td>{money(line.ledgerAmount, line.currency)}</td>
                    <td>
                      {line.actualAt === null ? "—" : formatDate(line.actualAt)}
                    </td>
                    <td>
                      {line.importedAt === null
                        ? "—"
                        : formatDate(line.importedAt)}
                    </td>
                    <td>{line.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
