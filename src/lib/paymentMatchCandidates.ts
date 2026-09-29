/**
 * PR05-07 / CF-6.4-02 / BE-15.2-05: how an imported payment row finds its
 * Capsule payment.
 *
 * - Same id: the row's own id or its accounting transaction id is the id a
 *   Capsule payment already carries (its provider id or an earlier match).
 *   That is proof, so it may be matched without a person choosing.
 * - Looks similar: same amount to the cent, ranked by how close the dates
 *   are. That is only a hint. A person must pick it; nothing applies it alone.
 * Payments already matched by another imported row are never offered.
 */

export interface ImportedPaymentFacts {
  externalId: string;
  amount: number | null;
  recordedAt: number | null;
  method: string | null;
  providerTransactionId: string | null;
  eventRef: string | null;
  invoiceRef: string | null;
  paymentType: string | null;
}

export interface MatchablePayment {
  _id: string;
  amount?: number | null;
  status?: string | null;
  deletedAt?: number | null;
  externalPaymentId?: string | null;
  matchedExternalId?: string | null;
  occurredAt?: number | null;
  recordedAt?: number | null;
}

export interface PaymentSuggestion {
  paymentId: string;
  daysApart: number | null;
}

export interface PaymentMatchCandidates {
  /** The one payment with the same id, when there is exactly one. */
  exactPaymentId: string | null;
  /** Same amount; a person must choose. Closest date first. */
  suggestions: PaymentSuggestion[];
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 5;

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads the facts the import kept on the link (`rawSourceData`). */
export function readImportedPayment(link: {
  externalId: string;
  rawSourceData?: string | null;
}): ImportedPaymentFacts {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(link.rawSourceData ?? "{}");
    if (parsed && typeof parsed === "object")
      raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    externalId: link.externalId,
    amount: num(raw.amount),
    recordedAt: num(raw.recordedAt),
    method: text(raw.method),
    providerTransactionId: text(raw.providerTransactionId),
    eventRef: text(raw.eventId),
    invoiceRef: text(raw.invoiceId),
    paymentType: text(raw.paymentType),
  };
}

const cents = (value: number) => Math.round(value * 100);

function paymentDate(payment: MatchablePayment): number | null {
  return num(payment.occurredAt) ?? num(payment.recordedAt);
}

export function paymentMatchCandidates(
  row: ImportedPaymentFacts,
  payments: readonly MatchablePayment[],
  takenPaymentIds: ReadonlySet<string> = new Set(),
): PaymentMatchCandidates {
  const open = payments.filter(
    (payment) =>
      payment.deletedAt == null &&
      payment.status !== "failed" &&
      !takenPaymentIds.has(payment._id),
  );
  const ids = new Set(
    [row.externalId, row.providerTransactionId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
  const exact = open.filter(
    (payment) =>
      (payment.externalPaymentId != null &&
        ids.has(payment.externalPaymentId)) ||
      (payment.matchedExternalId != null && ids.has(payment.matchedExternalId)),
  );
  if (exact.length === 1) {
    return { exactPaymentId: exact[0]._id, suggestions: [] };
  }

  const amount = row.amount;
  const similar =
    amount === null || amount === 0
      ? exact
      : open.filter(
          (payment) =>
            exact.includes(payment) ||
            (typeof payment.amount === "number" &&
              cents(payment.amount) === cents(Math.abs(amount))),
        );
  const suggestions = similar
    .map((payment) => {
      const date = paymentDate(payment);
      return {
        paymentId: payment._id,
        daysApart:
          date !== null && row.recordedAt !== null
            ? Math.round(Math.abs(date - row.recordedAt) / DAY)
            : null,
      };
    })
    .sort(
      (left, right) =>
        (left.daysApart ?? Number.MAX_SAFE_INTEGER) -
        (right.daysApart ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, MAX_SUGGESTIONS);
  return { exactPaymentId: null, suggestions };
}
