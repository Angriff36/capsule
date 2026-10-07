import { useState, type FormEvent } from "react";
import { useProposalSetPaymentSchedule } from "../../lib/manifest-convex-react";
import { formatDate, formatMoneyExact } from "../../lib/format";
import {
  paymentScheduleLines,
  proposalPaymentSchedule,
} from "../../lib/proposalPaymentSchedule";

interface ProposalPaymentSchedulePanelProps {
  proposal: {
    _id: string;
    version: number;
    total: number;
    eventDate?: number | null;
    depositPercent?: number | null;
    balanceDueDaysBefore?: number | null;
  };
  editable: boolean;
  onFailure: (error: Error) => void;
  onNotice: (message: string) => void;
}

/**
 * AC-654: the deposit (a share of the total, due when the client accepts)
 * and when the balance is due. Set on a draft; the send freezes the amounts
 * the client sees, and the accepted deposit goes onto the event's invoice.
 */
export function ProposalPaymentSchedulePanel({
  proposal,
  editable,
  onFailure,
  onNotice,
}: ProposalPaymentSchedulePanelProps) {
  const save = useProposalSetPaymentSchedule();
  const [busy, setBusy] = useState(false);
  const schedule = proposalPaymentSchedule({
    total: Number(proposal.total) || 0,
    depositPercent: proposal.depositPercent,
    balanceDueDaysBefore: proposal.balanceDueDaysBefore,
    eventDate: proposal.eventDate,
  });
  const lines = schedule ? paymentScheduleLines(schedule, formatDate) : [];
  const summary =
    lines.length > 0 ? (
      <ul className="mt-1 grid gap-1 text-sm text-ink">
        {lines.map((line) => (
          <li key={line.label} className="flex justify-between gap-4">
            <span>
              {line.label} <span className="text-ink-2">· {line.due}</span>
            </span>
            <span className="font-medium">{formatMoneyExact(line.amount)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-1 text-sm text-ink-2">
        No payment schedule on this proposal.
      </p>
    );

  if (!editable) {
    return (
      <div className="mt-3 rounded-sm border border-line bg-inset p-4">
        <p className="eyebrow">Payment schedule</p>
        {summary}
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const whole = (name: string) => {
      const value = String(data.get(name) ?? "").trim();
      return value === "" ? undefined : Number(value);
    };
    setBusy(true);
    try {
      await save({
        docId: proposal._id,
        version: proposal.version,
        depositPercent: whole("depositPercent"),
        balanceDueDaysBefore: whole("balanceDueDaysBefore"),
      });
      onNotice("Payment schedule saved.");
    } catch (error) {
      onFailure(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      key={proposal.version}
      className="mt-3 grid gap-3 rounded-sm border border-line bg-inset p-4"
      onSubmit={(event) => void submit(event)}
    >
      <p className="eyebrow">Payment schedule</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Deposit (% of the total, due when the client accepts)
          <input
            className="input"
            name="depositPercent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            defaultValue={proposal.depositPercent ?? ""}
          />
        </label>
        <label className="field-label">
          Balance due (days before the event, 0 = event day)
          <input
            className="input"
            name="balanceDueDaysBefore"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={proposal.balanceDueDaysBefore ?? ""}
          />
        </label>
      </div>
      {summary}
      <p className="text-xs text-ink-2">Leave both empty for no schedule.</p>
      <div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save payment schedule"}
        </button>
      </div>
    </form>
  );
}
