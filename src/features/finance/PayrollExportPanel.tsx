import { formatCountNoun } from "../../lib/format";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import {
  PAYROLL_PROCESSORS,
  payrollCsvDownloadAllowed,
  type PayrollExportDocument,
  type PayrollProcessor,
} from "./payrollExport";

/**
 * Pay-period export panel: period/processor controls, the per-employee
 * preview, and the CSV download.
 *
 * Payroll-identity contract (owner, 2026-08-19):
 *  - the preview shows names, never raw Capsule _ids;
 *  - a missing hourly rate is flagged next to the person's name (never
 *    invent a rate);
 *  - the CSV download stays disabled while any row lacks an employee
 *    number, so a CSV of raw IDs can never reach a payroll processor.
 */
export function PayrollExportPanel({
  loading,
  periodStart,
  periodEnd,
  processor,
  onPeriodStartChange,
  onPeriodEndChange,
  onProcessorChange,
  document,
  error,
  hourlyRateByPersonId,
  onNotice,
}: {
  loading: boolean;
  periodStart: string;
  periodEnd: string;
  processor: PayrollProcessor;
  onPeriodStartChange: (value: string) => void;
  onPeriodEndChange: (value: string) => void;
  onProcessorChange: (value: PayrollProcessor) => void;
  document: PayrollExportDocument | null;
  error: string | null;
  /** null while rates are loading/unavailable — no missing-rate flags then. */
  hourlyRateByPersonId: ReadonlyMap<string, number | null> | null;
  onNotice: (message: string) => void;
}) {
  const missingRate = (personId: string) =>
    hourlyRateByPersonId != null && hourlyRateByPersonId.get(personId) == null;
  const estimatedGross = (personId: string, totalHours: number) => {
    const rate = hourlyRateByPersonId?.get(personId);
    if (rate == null || !Number.isFinite(rate)) return null;
    return totalHours * rate;
  };

  const missingNumberNames = (document?.rows ?? [])
    .filter((row) => row.missingEmployeeNumber)
    .map((row) => row.employeeName);
  const downloadDisabled = loading || !payrollCsvDownloadAllowed(document);

  const downloadExport = () => {
    if (!payrollCsvDownloadAllowed(document) || !document) return;
    const url = URL.createObjectURL(
      new Blob([document.csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    onNotice(
      `${document.rows.length} payroll row${document.rows.length === 1 ? "" : "s"} exported for ${PAYROLL_PROCESSORS.find((item) => item.value === processor)?.label ?? processor}.`,
    );
  };

  return (
    <section
      className="supply-form"
      aria-labelledby="payroll-export-title"
      data-testid="payroll-export-panel"
    >
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">Pay period export</p>
          <h2 id="payroll-export-title">Compile payroll data</h2>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={downloadDisabled}
          onClick={downloadExport}
        >
          Download CSV
        </button>
      </div>
      <p className="text-base text-ink-2">
        Completed time records supply clocked hours. A finalized payroll input
        becomes the reviewed total for that person and period; its difference
        from clocked time is shown as the manual adjustment.
      </p>
      <div className="supply-form-grid mt-3">
        <label className="field-label">
          Period start
          <BoundedDateInput
            className="input"
            aria-label="Payroll period start"
            value={periodStart}
            onChange={(event) => onPeriodStartChange(event.target.value)}
          />
        </label>
        <label className="field-label">
          Period end
          <BoundedDateInput
            className="input"
            aria-label="Payroll period end"
            value={periodEnd}
            onChange={(event) => onPeriodEndChange(event.target.value)}
          />
        </label>
        <label className="field-label">
          Payroll processor
          <select
            className="input"
            aria-label="Payroll processor"
            value={processor}
            onChange={(event) =>
              onProcessorChange(event.target.value as PayrollProcessor)
            }
          >
            {PAYROLL_PROCESSORS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm text-ink-3">
        {`${PAYROLL_PROCESSORS.find((item) => item.value === processor)?.detail ?? ""} CSV opens in Excel; company-specific earning codes or import mappings may still be required by ADP or Paychex.`}
      </p>
      {error ? (
        <p className="mt-3 text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {document ? (
        <PayrollExportPreview
          document={document}
          missingNumberNames={missingNumberNames}
          missingRate={missingRate}
          estimatedGross={estimatedGross}
        />
      ) : null}
    </section>
  );
}

function PayrollExportPreview({
  document,
  missingNumberNames,
  missingRate,
  estimatedGross,
}: {
  document: PayrollExportDocument;
  missingNumberNames: readonly string[];
  missingRate: (personId: string) => boolean;
  estimatedGross: (personId: string, totalHours: number) => number | null;
}) {
  return (
    <>
      <div className="ledger-heading mt-4">
        <div>
          <p className="eyebrow">Export preview</p>
          <h2>{formatCountNoun(document.rows.length, "employee")}</h2>
        </div>
        <span>{`${formatCountNoun(document.timeRecordCount, "time record")} · ${formatCountNoun(document.payrollInputCount, "finalized input")}`}</span>
      </div>
      {missingNumberNames.length > 0 ? (
        <p className="mb-3 text-sm text-warn" role="status">
          {`CSV download is off until every employee has a payroll employee number — missing for ${missingNumberNames.join(", ")}. Add it when hiring under Admin → Permissions; raw Capsule IDs are never sent to a payroll processor.`}
        </p>
      ) : null}
      {document.rows.length === 0 ? (
        <div className="document-empty">
          <p>No payroll-ready data in this period.</p>
          <span>
            Close time records or finalize payroll inputs, then refresh this pay
            period.
          </span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Regular</th>
                <th>Overtime</th>
                <th>Recorded</th>
                <th>Manual adjustment</th>
                <th>Est. gross</th>
              </tr>
            </thead>
            <tbody>
              {document.rows.map((row) => {
                const gross = estimatedGross(
                  row.personId,
                  row.regularHours + row.overtimeHours,
                );
                return (
                  <tr key={row.personId}>
                    <td>
                      <strong>{row.employeeName}</strong>
                      {missingRate(row.personId) ? (
                        <small className="text-warn">No hourly rate set</small>
                      ) : null}
                      {row.missingEmployeeNumber ? (
                        <small className="text-warn">No employee number</small>
                      ) : (
                        <small>{row.employeeId}</small>
                      )}
                    </td>
                    <td>{row.regularHours.toFixed(2)} h</td>
                    <td>{row.overtimeHours.toFixed(2)} h</td>
                    <td>{row.recordedHours.toFixed(2)} h</td>
                    <td>{row.manualAdjustmentHours.toFixed(2)} h</td>
                    <td>
                      {gross == null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        `$${gross.toFixed(2)}`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
