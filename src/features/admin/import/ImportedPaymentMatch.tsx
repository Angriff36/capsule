import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../../lib/api";
import { formatMoneyExact } from "../../../lib/format";
import {
  paymentMatchCandidates,
  readImportedPayment,
  type MatchablePayment,
} from "../../../lib/paymentMatchCandidates";

type Payment = MatchablePayment & { invoiceId?: unknown };

/**
 * One imported payment row on the matching screen (PR05-07, CF-6.4-01/02):
 * what the old system said about the money, the Capsule payment with the same
 * id if there is one, and look-alikes a person must choose between.
 */
export function ImportedPaymentMatch({
  link,
  payments,
  takenPaymentIds,
  invoiceLabel,
  disabled,
  onDone,
  onError,
}: Readonly<{
  link: { _id: string; externalId: string; rawSourceData?: string | null };
  payments: readonly Payment[];
  takenPaymentIds: ReadonlySet<string>;
  invoiceLabel: (invoiceId: string) => string;
  disabled: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const match = useMutation(api.importPaymentMatch.matchImportedPayment);
  const facts = readImportedPayment(link);
  const { exactPaymentId, suggestions } = paymentMatchCandidates(
    facts,
    payments,
    takenPaymentIds,
  );
  const [paymentId, setPaymentId] = useState(exactPaymentId ?? "");
  const [busy, setBusy] = useState(false);

  const label = (id: string) => {
    const payment = payments.find((row) => row._id === id);
    if (!payment) return id;
    return `${invoiceLabel(String(payment.invoiceId))} · ${formatMoneyExact(
      Number(payment.amount ?? 0),
    )} · ${String(payment.status)}`;
  };
  const suggested = new Set(suggestions.map((row) => row.paymentId));
  const others = payments.filter(
    (row) =>
      row.deletedAt == null &&
      !takenPaymentIds.has(row._id) &&
      row._id !== exactPaymentId &&
      !suggested.has(row._id),
  );

  const said = [
    facts.amount !== null ? formatMoneyExact(facts.amount) : null,
    facts.recordedAt !== null
      ? new Date(facts.recordedAt).toLocaleDateString()
      : null,
    facts.method,
    facts.paymentType,
    facts.eventRef ? `old event ${facts.eventRef}` : null,
    facts.invoiceRef ? `old invoice ${facts.invoiceRef}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      {said.length > 0 ? (
        <span className="text-ink-2">{said.join(" · ")}</span>
      ) : null}
      <span className={exactPaymentId ? "text-ok" : "text-ink-3"}>
        {exactPaymentId
          ? "Same id as a Capsule payment — safe to match."
          : suggestions.length > 0
            ? "Only look-alikes (same amount). Check before you match."
            : "No Capsule payment looks like this yet."}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={paymentId}
          onChange={(e) => setPaymentId(e.target.value)}
          disabled={disabled || busy}
          className="px-2 py-1 border border-line-2 rounded-sm text-2xs min-w-56"
          aria-label="Capsule payment"
        >
          <option value="">Pick a Capsule payment…</option>
          {exactPaymentId ? (
            <optgroup label="Same id">
              <option value={exactPaymentId}>{label(exactPaymentId)}</option>
            </optgroup>
          ) : null}
          {suggestions.length > 0 ? (
            <optgroup label="Same amount — check first">
              {suggestions.map((row) => (
                <option key={row.paymentId} value={row.paymentId}>
                  {label(row.paymentId)}
                  {row.daysApart !== null
                    ? ` · ${row.daysApart} days apart`
                    : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          {others.length > 0 ? (
            <optgroup label="Other payments">
              {others.map((row) => (
                <option key={row._id} value={row._id}>
                  {label(row._id)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || busy || !paymentId}
          onClick={() => {
            setBusy(true);
            void match({
              linkId: link._id as Id<"externalRecordLinks">,
              paymentId: paymentId as Id<"payments">,
            })
              .then(() => onDone("Payment matched and taken off the list."))
              .catch((cause: unknown) =>
                onError(
                  cause instanceof Error
                    ? cause.message
                    : "Couldn't match that payment.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Match
        </button>
      </div>
    </div>
  );
}
