import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePayrollInput,
  useListEvent,
  useListPayrollInput,
  useListPerson,
  useListTimeRecord,
  usePayrollInputFinalize,
  usePayrollInputMarkVoided,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatDate } from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { PayrollLifecyclePolicy } from "./PayrollLifecyclePolicy";
import {
  buildPayrollExport,
  PAYROLL_PROCESSORS,
  type PayrollProcessor,
} from "./payrollExport";
import {
  PayrollPrepareForm,
  PayrollPreparePayloadBuilder,
} from "./PayrollPrepareForm";

const policy = new PayrollLifecyclePolicy();
const payloadBuilder = new PayrollPreparePayloadBuilder();

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const initialPeriod = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: dateInputValue(start), end: dateInputValue(today) };
};

export function PayrollPage() {
  const payrollInputs = useListPayrollInput();
  const timeRecords = useListTimeRecord();
  const people = useListPerson();
  const events = useListEvent();
  const createPayroll = useCreatePayrollInput();
  const finalize = usePayrollInputFinalize();
  const markVoided = usePayrollInputMarkVoided();
  const [showPrepare, setShowPrepare] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [period] = useState(initialPeriod);
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [processor, setProcessor] = useState<PayrollProcessor>("gusto");
  const { prompt, host } = useActionPrompt(busy != null);

  const activeRows = (payrollInputs ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) => !["finalized", "voided"].includes(String(row.status)),
      );

  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Unknown person";
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitPrepare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = payloadBuilder.fromForm(new FormData(form));
      void run("prepare-payroll", async () => {
        await createPayroll(payload);
        form.reset();
        setShowPrepare(false);
        setNotice("Payroll input prepared. Finalize when ready to export.");
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "void") {
        const reason = await prompt.askReason({
          ...ReasonCopy.voidPayrollInput,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await markVoided({
            docId: row._id,
            version: row.version,
            reason,
          });
          setNotice("Payroll input voided.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        await finalize({ docId: row._id, version: row.version });
        setNotice("Payroll input finalized.");
      });
    })();
  };

  const loading =
    payrollInputs === undefined ||
    timeRecords === undefined ||
    people === undefined ||
    events === undefined;

  const payrollExport = useMemo(() => {
    try {
      return {
        document: buildPayrollExport({
          processor,
          periodStart,
          periodEnd,
          people: people ?? [],
          timeRecords: timeRecords ?? [],
          payrollInputs: payrollInputs ?? [],
        }),
        error: null,
      };
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error.message : "Invalid pay period.",
      };
    }
  }, [payrollInputs, people, periodEnd, periodStart, processor, timeRecords]);

  const downloadExport = () => {
    const document = payrollExport.document;
    if (!document || document.rows.length === 0) return;
    const url = URL.createObjectURL(
      new Blob([document.csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(
      `${document.rows.length} payroll row${document.rows.length === 1 ? "" : "s"} exported for ${PAYROLL_PROCESSORS.find((item) => item.value === processor)?.label ?? processor}.`,
    );
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Payroll</p>
          <h1 className="display-title mt-2">Payroll inputs</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Prepare a period rollup for a person, then finalize for export or
            void if the numbers are wrong. Finance managers only.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide closed" : "Show closed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowPrepare((value) => !value)}
          >
            {showPrepare ? "Close form" : "Prepare input"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

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
            disabled={
              loading ||
              payrollExport.document == null ||
              payrollExport.document.rows.length === 0
            }
            onClick={downloadExport}
          >
            Download CSV
          </button>
        </div>
        <p className="text-[13px] text-ink-2">
          Completed time records supply clocked hours. A finalized payroll input
          becomes the reviewed total for that person and period; its difference
          from clocked time is shown as the manual adjustment.
        </p>
        <div className="supply-form-grid mt-3">
          <label className="field-label">
            Period start
            <input
              className="input"
              aria-label="Payroll period start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label className="field-label">
            Period end
            <input
              className="input"
              aria-label="Payroll period end"
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </label>
          <label className="field-label">
            Payroll processor
            <select
              className="input"
              aria-label="Payroll processor"
              value={processor}
              onChange={(event) =>
                setProcessor(event.target.value as PayrollProcessor)
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
        <p className="mt-3 text-[12px] text-ink-3">
          {`${PAYROLL_PROCESSORS.find((item) => item.value === processor)?.detail ?? ""} CSV opens in Excel; company-specific earning codes or import mappings may still be required by ADP or Paychex.`}
        </p>
        {payrollExport.error ? (
          <p className="mt-3 text-[13px] text-danger" role="alert">
            {payrollExport.error}
          </p>
        ) : null}
        {payrollExport.document ? (
          <>
            <div className="ledger-heading mt-4">
              <div>
                <p className="eyebrow">Export preview</p>
                <h2>{payrollExport.document.rows.length} employees</h2>
              </div>
              <span>{`${payrollExport.document.timeRecordCount} time records · ${payrollExport.document.payrollInputCount} finalized inputs`}</span>
            </div>
            {payrollExport.document.fallbackEmployeeIdCount > 0 ? (
              <p className="mb-3 text-[12px] text-warn" role="status">
                {`${payrollExport.document.fallbackEmployeeIdCount} employee ID${payrollExport.document.fallbackEmployeeIdCount === 1 ? " uses" : "s use"} the Capsule person ID because no employee number is set.`}
              </p>
            ) : null}
            {payrollExport.document.rows.length === 0 ? (
              <div className="document-empty">
                <p>No payroll-ready data in this period.</p>
                <span>
                  Close time records or finalize payroll inputs, then refresh
                  this pay period.
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
                    </tr>
                  </thead>
                  <tbody>
                    {payrollExport.document.rows.map((row) => (
                      <tr key={row.personId}>
                        <td>
                          <strong>{row.employeeName}</strong>
                          <small>{row.employeeId}</small>
                        </td>
                        <td>{row.regularHours.toFixed(2)} h</td>
                        <td>{row.overtimeHours.toFixed(2)} h</td>
                        <td>{row.recordedHours.toFixed(2)} h</td>
                        <td>{row.manualAdjustmentHours.toFixed(2)} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>

      {showPrepare ? (
        <PayrollPrepareForm
          people={people ?? []}
          events={events ?? []}
          busy={busy === "prepare-payroll"}
          onSubmit={submitPrepare}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Export worksheet</p>
            <h2>Payroll inputs</h2>
          </div>
          <span>{visibleRows.length} rows</span>
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
                onClick={() => setShowPrepare(true)}
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
                {visibleRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(String(row.personId))}</strong>
                      <small>
                        {row.periodStart ? formatDate(row.periodStart) : "—"} →{" "}
                        {row.periodEnd ? formatDate(row.periodEnd) : "—"}
                      </small>
                    </td>
                    <td>
                      {row.totalMinutes}{" "}
                      <small>
                        ({row.regularMinutes} reg / {row.overtimeMinutes} OT)
                      </small>
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
                              onClick={() => invoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-[12px] text-ink-3">
        Saved report definitions live under{" "}
        <Link className="text-link" to="/reports">
          Reports
        </Link>
        . Event closeouts live under{" "}
        <Link className="text-link" to={FINANCE_ROUTES.closeout}>
          Closeout
        </Link>
        .
      </p>
    </div>
  );
}
