import { formatDate, formatMoneyExact } from "../../lib/format";
import {
  paymentScheduleLines,
  type ProposalPaymentSchedule,
} from "../../lib/proposalPaymentSchedule";

/**
 * AC-654: what the client pays and when, as frozen with the proposal. Used
 * by the client's link page and the signing page so both read the same.
 */
export function ProposalPaymentScheduleList({
  schedule,
}: {
  schedule: ProposalPaymentSchedule;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">
        Payment schedule
      </h2>
      <div className="space-y-2">
        {paymentScheduleLines(schedule, formatDate).map((line) => (
          <div key={line.label} className="flex justify-between gap-4 text-xs">
            <span>
              <span className="font-medium text-ink">{line.label}</span>
              <span className="block text-ink-3">{line.due}</span>
            </span>
            <span className="font-medium">{formatMoneyExact(line.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
