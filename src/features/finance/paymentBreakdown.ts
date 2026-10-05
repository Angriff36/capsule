import { formatMoneyExact } from "../../lib/format";

/** The money parts a settled payment keeps (payment.manifest). */
export interface PaymentParts {
  amount?: number | null;
  appliedAmount?: number | null;
  unappliedAmount?: number | null;
  refundedAmount?: number | null;
  chargedBackAmount?: number | null;
  returnedAmount?: number | null;
  feeAmount?: number | null;
  gratuityAmount?: number | null;
}

const PARTS: readonly [keyof PaymentParts, string][] = [
  ["appliedAmount", "on the invoice"],
  ["unappliedAmount", "paid extra, held for the client"],
  ["refundedAmount", "refunded"],
  ["chargedBackAmount", "taken back by the card company"],
  ["returnedAmount", "returned by the bank"],
  ["feeAmount", "card fee"],
  ["gratuityAmount", "tip"],
];

/**
 * One plain line of where a payment's money went, or null when it all went
 * on the invoice and nothing else rides on it.
 */
export function paymentBreakdown(payment: PaymentParts): string | null {
  const amount = Number(payment.amount ?? 0);
  const parts = PARTS.flatMap(([key, label]) => {
    const value = Number(payment[key] ?? 0);
    return value > 0
      ? [{ key, text: `${formatMoneyExact(value)} ${label}` }]
      : [];
  });
  const onlyApplied =
    parts.length === 1 &&
    parts[0]?.key === "appliedAmount" &&
    Number(payment.appliedAmount) === amount;
  if (parts.length === 0 || onlyApplied) return null;
  return parts.map((part) => part.text).join(" · ");
}
