import { useState } from "react";
import {
  useCreatePayrollExportRecord,
  useListPayrollExportRecord,
  usePayrollExportRecordAcknowledge,
  usePayrollExportRecordReject,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip } from "../../ui/primitives";
import type { PayrollExportDocument } from "./payrollExport";
import {
  payrollPeriodKey,
  planPayrollRevisions,
  type PayrollRevisionPlan,
} from "./payrollReconcile";

type ReceiptRow = {
  _id: string;
  version?: number;
  personId: string;
  periodKey: string;
  revision: number;
  totalMinutes: number;
  deltaMinutes: number;
  status: string;
  providerReference?: string | null;
  rejectionReason?: string | null;
  deletedAt?: number | null;
};

const hours = (minutes: number) => `${(minutes / 60).toFixed(2)} h`;
const signed = (minutes: number) =>
  `${minutes >= 0 ? "+" : "−"}${hours(Math.abs(minutes))}`;

/**
 * PL-PAYROLL (AC-130, AC-510): what was already sent for this pay period,
 * the revision this export will record for each person, and the receipt
 * for each send (accepted or turned down by the payroll provider).
 */
export function usePayrollReceipts(document: PayrollExportDocument | null) {
  const listed = useListPayrollExportRecord() as ReceiptRow[] | undefined;
  const record = useCreatePayrollExportRecord();
  const receipts = (listed ?? []).filter((row) => row.deletedAt == null);
  const plans: PayrollRevisionPlan[] = document
    ? planPayrollRevisions({
        rows: document.rows.map((row) => ({
          personId: row.personId,
          totalMinutes: Math.round((row.regularHours + row.overtimeHours) * 60),
        })),
        receipts,
        periodStart: document.periodStart,
        periodEnd: document.periodEnd,
      })
    : [];
  /** Record one receipt per person whose total changed since the last send. */
  const recordSend = async () => {
    if (!document) return 0;
    let written = 0;
    for (const plan of plans) {
      if (!plan.changed) continue;
      const row = document.rows.find((item) => item.personId === plan.personId);
      const regularMinutes = Math.round((row?.regularHours ?? 0) * 60);
      const overtimeMinutes = Math.round((row?.overtimeHours ?? 0) * 60);
      await record({
        personId: plan.personId,
        periodKey: plan.periodKey,
        periodStart: document.periodStart,
        periodEnd: document.periodEnd,
        processor: document.processor,
        revision: plan.revision,
        regularMinutes,
        overtimeMinutes,
        totalMinutes: regularMinutes + overtimeMinutes,
        deltaMinutes: plan.deltaMinutes,
        ...(plan.previousTotalMinutes != null
          ? { previousTotalMinutes: plan.previousTotalMinutes }
          : {}),
        idempotencyKey: `${plan.periodKey}#${plan.revision}`,
      });
      written += 1;
    }
    return written;
  };
  return { receipts, plans, recordSend, loading: listed === undefined };
}

export function PayrollPlanNote({ plan }: { plan?: PayrollRevisionPlan }) {
  if (!plan || plan.previousTotalMinutes == null) return null;
  return (
    <small className={`block ${plan.changed ? "text-warn" : "text-ink-3"}`}>
      {plan.changed
        ? `Sent before as ${hours(plan.previousTotalMinutes)} — this download is revision ${plan.revision}, ${signed(plan.deltaMinutes)}`
        : `Already sent (revision ${plan.revision}), no change`}
    </small>
  );
}

export function PayrollReceiptsList({
  document,
  receipts,
  personName,
  onFailure,
}: {
  document: PayrollExportDocument;
  receipts: readonly ReceiptRow[];
  personName: (personId: string) => string;
  onFailure: (error: unknown) => void;
}) {
  const acknowledge = usePayrollExportRecordAcknowledge();
  const reject = usePayrollExportRecordReject();
  const { prompt, host } = useActionPrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const inPeriod = receipts
    .filter(
      (row) =>
        row.periodKey ===
        payrollPeriodKey(
          row.personId,
          document.periodStart,
          document.periodEnd,
        ),
    )
    .sort(
      (a, b) =>
        personName(a.personId).localeCompare(personName(b.personId)) ||
        b.revision - a.revision,
    );
  if (inPeriod.length === 0) return null;
  const run = (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    work()
      .catch(onFailure)
      .finally(() => setBusy(null));
  };
  return (
    <div className="mt-4" data-testid="payroll-receipts">
      {host}
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Sent to payroll</p>
          <h2>Receipts for this period</h2>
        </div>
      </div>
      <ul className="grid gap-2 px-1 py-2 text-sm">
        {inPeriod.map((row) => (
          <li key={row._id} className="flex flex-wrap items-center gap-3">
            <span>
              {personName(row.personId)} · revision {row.revision} ·{" "}
              {hours(row.totalMinutes)}
              {row.revision > 1 ? ` (${signed(row.deltaMinutes)})` : ""}
            </span>
            <StatusChip
              status={row.status}
              label={
                row.status === "acknowledged"
                  ? "Provider accepted"
                  : row.status === "rejected"
                    ? "Provider turned down"
                    : "Sent"
              }
            />
            {row.rejectionReason ? (
              <span className="text-warn">{row.rejectionReason}</span>
            ) : null}
            {row.status === "exported" ? (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() =>
                    run(row._id, async () => {
                      const values = await prompt.askFields({
                        title: "Provider accepted",
                        description:
                          "Optional: the batch or reference number from the payroll provider.",
                        fields: [
                          { name: "providerReference", label: "Reference" },
                        ],
                        confirmLabel: "Save",
                      });
                      if (!values) return;
                      const reference = String(
                        values.providerReference ?? "",
                      ).trim();
                      await acknowledge({
                        docId: row._id,
                        version: row.version,
                        ...(reference ? { providerReference: reference } : {}),
                      });
                    })
                  }
                >
                  Provider accepted
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() =>
                    run(row._id, async () => {
                      const values = await prompt.askFields({
                        title: "Provider turned it down",
                        description:
                          "The approved time stays as it is; the next download sends it again.",
                        fields: [
                          { name: "reason", label: "Why", required: true },
                        ],
                        confirmLabel: "Save",
                      });
                      if (!values) return;
                      await reject({
                        docId: row._id,
                        version: row.version,
                        reason: String(values.reason ?? "").trim(),
                      });
                    })
                  }
                >
                  Turned down
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
