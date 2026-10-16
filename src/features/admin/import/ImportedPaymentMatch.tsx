import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../../../lib/api";
import { formatMoneyExact } from "../../../lib/format";

/**
 * One imported payment on the matching screen. The same-id payment and the
 * same-amount look-alikes come from the server. Typing finds more. The
 * payment list is not loaded.
 */
export function ImportedPaymentMatch({
  linkId,
  disabled,
  onDone,
  onError,
}: Readonly<{
  linkId: string;
  disabled: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const match = useMutation(api.importPaymentMatch.matchImportedPayment);
  const [text, setText] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = useQuery(api.importPaymentChoices.forLink, {
    linkId: linkId as Id<"externalRecordLinks">,
    text: text.trim().length >= 2 ? text.trim() : undefined,
  });

  const said = [
    choices?.amount != null ? formatMoneyExact(choices.amount) : null,
    choices?.recordedAt != null
      ? new Date(choices.recordedAt).toLocaleDateString()
      : null,
    choices?.method,
    choices?.paymentType,
    choices?.eventRef ? `old event ${choices.eventRef}` : null,
    choices?.invoiceRef ? `old invoice ${choices.invoiceRef}` : null,
  ].filter(Boolean);

  const label = (row: {
    invoiceNumber: string;
    amount: number;
    status: string;
    daysApart: number | null;
  }) => {
    const apart =
      row.daysApart !== null ? ` · ${row.daysApart} days apart` : "";
    return `${row.invoiceNumber} · ${formatMoneyExact(row.amount)} · ${row.status}${apart}`;
  };

  const exactId = choices?.exact?.id ?? "";
  const selected = paymentId || exactId;

  return (
    <div className="flex flex-col gap-1">
      {said.length > 0 ? (
        <span className="text-ink-2">{said.join(" · ")}</span>
      ) : null}
      <span className={exactId ? "text-ok" : "text-ink-3"}>
        {choices === undefined
          ? "Looking up payments…"
          : exactId
            ? "Same id as a Capsule payment — safe to match."
            : (choices.suggestions.length ?? 0) > 0
              ? "Only look-alikes (same amount). Check before you match."
              : "No Capsule payment looks like this yet."}
      </span>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={disabled || busy}
        placeholder="Invoice number, amount, or old id"
        aria-label="Find a Capsule payment"
        className="px-2 py-1 border border-line-2 rounded-sm text-2xs min-w-56"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(event) => setPaymentId(event.target.value)}
          disabled={disabled || busy || choices === undefined}
          className="px-2 py-1 border border-line-2 rounded-sm text-2xs min-w-56"
          aria-label="Capsule payment"
        >
          <option value="">Pick a Capsule payment…</option>
          {choices?.exact ? (
            <optgroup label="Same id">
              <option value={choices.exact.id}>{label(choices.exact)}</option>
            </optgroup>
          ) : null}
          {choices && choices.suggestions.length > 0 ? (
            <optgroup label="Same amount — check first">
              {choices.suggestions.map((row) => (
                <option key={row.id} value={row.id}>
                  {label(row)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {choices && choices.matches.length > 0 ? (
            <optgroup label="Matches">
              {choices.matches.map((row) => (
                <option key={row.id} value={row.id}>
                  {label(row)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || busy || !selected}
          onClick={() => {
            setBusy(true);
            void match({
              linkId: linkId as Id<"externalRecordLinks">,
              paymentId: selected as Id<"payments">,
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
