import { useMemo, useState } from "react";
import {
  useCreateSavedReportDefinition,
  useListInvoice,
  useListPayment,
} from "../../lib/manifest-convex-react";
import { useExternalRecordLinksFor } from "../../lib/useExternalRecordLinkLists";
import {
  buildFinanceReconciliation,
  sourceMoneySpan,
  type ReconciliationInvoice,
  type ReconciliationPayment,
  type ReconciliationSourceRow,
} from "../../lib/financeReconciliation";
import { TableSkeleton } from "../../ui/primitives";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { useActionFailure, useActionNotice } from "../../ui/action-result";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { ReconciliationTables } from "./ReconciliationTables";

function dayValue(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function startOfDay(value: string): number | null {
  return value ? Date.parse(`${value}T00:00:00Z`) : null;
}

function endOfDay(value: string): number | null {
  return value ? Date.parse(`${value}T23:59:59.999Z`) : null;
}

/**
 * PR05-10 / AC-093: the money check. Old-system money rows against Capsule
 * payments, by month, currency and result, with every row that does not
 * agree. Saving keeps a copy of exactly what was shown, with the date it was
 * made, under Reports.
 */
export function FinanceReconciliationPage() {
  // Only payment rows: the full link list is too long for one read.
  const links = useExternalRecordLinksFor({ recordTypes: ["payment"] });
  const payments = useListPayment();
  const invoices = useListInvoice();
  const saveReport = useCreateSavedReportDefinition();
  const { notice, setNotice } = useActionNotice();
  const { error, setError } = useActionFailure();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  const sourceRows = (links ?? []) as readonly ReconciliationSourceRow[];
  const span = useMemo(() => sourceMoneySpan(sourceRows), [sourceRows]);
  const fromValue = from ?? (span ? dayValue(span.from) : "");
  const toValue = to ?? (span ? dayValue(span.to) : "");

  const report = useMemo(
    () =>
      buildFinanceReconciliation({
        sourceRows,
        payments: (payments ?? []) as readonly ReconciliationPayment[],
        invoices: (invoices ?? []) as readonly ReconciliationInvoice[],
        from: startOfDay(fromValue),
        to: endOfDay(toValue),
        generatedAt: Date.now(),
      }),
    [sourceRows, payments, invoices, fromValue, toValue],
  );
  const loading =
    links === undefined || payments === undefined || invoices === undefined;

  const save = () => {
    setBusy(true);
    setError(null);
    const window = [fromValue || "start", toValue || "today"].join(" to ");
    void Promise.resolve(
      saveReport({
        name: `Money check ${window}`,
        subjectArea: "finance",
        chartType: "table",
        sharingScope: "team",
        definition: { ...report, generatedAt: Date.now() },
      }),
    )
      .then(() => setNotice("Saved. Find it under Reports."))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Couldn't save this report.",
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Money check</p>
          <h1 className="display-title mt-2">Old system against Capsule</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Every payment brought in from the old system next to the Capsule
            payment it matches, by month. Rows that do not agree are listed with
            the reason. The same money seen twice and record-only rows are shown
            but never counted.
          </p>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {error ? (
        <p className="mt-3 text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          From
          <BoundedDateInput
            value={fromValue}
            onChange={(event) => setFrom(event.target.value)}
            className="px-2 py-1 border border-line-2 rounded-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          To
          <BoundedDateInput
            value={toValue}
            onChange={(event) => setTo(event.target.value)}
            className="px-2 py-1 border border-line-2 rounded-sm"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || loading || report.periods.length === 0}
          onClick={save}
        >
          Save this report
        </button>
      </div>
      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : (
          <ReconciliationTables report={report} />
        )}
      </div>
    </div>
  );
}
