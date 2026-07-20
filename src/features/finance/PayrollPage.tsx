import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePayrollInput,
  useListEvent,
  useListPayrollInput,
  useListPerson,
  usePayrollInputFinalize,
  usePayrollInputMarkVoided,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { PayrollLifecyclePolicy } from "./PayrollLifecyclePolicy";
import {
  PayrollPrepareForm,
  PayrollPreparePayloadBuilder,
} from "./PayrollPrepareForm";

const policy = new PayrollLifecyclePolicy();
const payloadBuilder = new PayrollPreparePayloadBuilder();

export function PayrollPage() {
  const payrollInputs = useListPayrollInput();
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
    payrollInputs === undefined || people === undefined || events === undefined;

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
                        {row.periodStart
                          ? new Date(row.periodStart).toLocaleDateString()
                          : "—"}{" "}
                        →{" "}
                        {row.periodEnd
                          ? new Date(row.periodEnd).toLocaleDateString()
                          : "—"}
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
        Saved report definitions remain deferred on{" "}
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
