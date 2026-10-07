// AC-654: a proposal's payment schedule - the deposit due when the client
// accepts and the balance due before the event. One calculation for the
// office panel, the client's link page, the proposal file and the frozen
// revision, so they all show the same amounts. Money is worked in whole
// cents; the deposit rounds to the nearest cent and the balance is the rest,
// so deposit + balance is always the total.

export interface ProposalPaymentSchedule {
  depositPercent: number;
  depositAmount: number;
  balanceAmount: number;
  /** Days before the event the balance is due; 0 = on the event day. */
  balanceDueDaysBefore: number;
  /** The balance due date, when the event date is known. */
  balanceDueAt: number | null;
}

const DAY_MS = 24 * 60 * 60_000;

export function proposalPaymentSchedule(input: {
  total: number;
  depositPercent?: number | null;
  balanceDueDaysBefore?: number | null;
  eventDate?: number | null;
}): ProposalPaymentSchedule | null {
  const percent = input.depositPercent;
  const days = input.balanceDueDaysBefore;
  if (percent == null && days == null) return null;
  const depositPercent = Math.min(100, Math.max(0, Number(percent ?? 0)));
  const balanceDueDaysBefore = Math.max(0, Math.round(Number(days ?? 0)));
  const totalCents = Math.round(Number(input.total || 0) * 100);
  const depositCents = Math.round((totalCents * depositPercent) / 100);
  return {
    depositPercent,
    depositAmount: depositCents / 100,
    balanceAmount: (totalCents - depositCents) / 100,
    balanceDueDaysBefore,
    balanceDueAt:
      typeof input.eventDate === "number"
        ? input.eventDate - balanceDueDaysBefore * DAY_MS
        : null,
  };
}

/** A frozen schedule read back from a revision snapshot; null when absent. */
export function frozenPaymentSchedule(
  value: unknown,
): ProposalPaymentSchedule | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const num = (key: string) =>
    typeof row[key] === "number" ? (row[key] as number) : null;
  const depositAmount = num("depositAmount");
  const balanceAmount = num("balanceAmount");
  if (depositAmount == null || balanceAmount == null) return null;
  return {
    depositPercent: num("depositPercent") ?? 0,
    depositAmount,
    balanceAmount,
    balanceDueDaysBefore: num("balanceDueDaysBefore") ?? 0,
    balanceDueAt: num("balanceDueAt"),
  };
}

export interface PaymentScheduleLine {
  label: string;
  amount: number;
  due: string;
}

/** The rows the client reads, in the order they pay. */
export function paymentScheduleLines(
  schedule: ProposalPaymentSchedule,
  formatDate: (at: number) => string,
): PaymentScheduleLine[] {
  const lines: PaymentScheduleLine[] = [];
  if (schedule.depositPercent > 0) {
    lines.push({
      label: `Deposit (${schedule.depositPercent}%)`,
      amount: schedule.depositAmount,
      due: "Due when you accept",
    });
  }
  const days = schedule.balanceDueDaysBefore;
  const when =
    days === 0
      ? "Due on the event day"
      : `Due ${days} day${days === 1 ? "" : "s"} before the event`;
  lines.push({
    label: schedule.depositPercent > 0 ? "Balance" : "Full amount",
    amount: schedule.balanceAmount,
    due:
      schedule.balanceDueAt != null
        ? `${when} (${formatDate(schedule.balanceDueAt)})`
        : when,
  });
  return lines;
}
