import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../lib/api";
import { formatDate, formatMoney } from "../../../lib/format";
import type {
  ReconstructedInvoice,
  ReconstructedMoney,
} from "../../../lib/ledgerReconstruction";

/**
 * Old invoices rebuilt from the records the import kept (AC-086). Shows what
 * the old records say and names what they do not have. "Save as checked"
 * keeps the check; it never makes a live invoice, payment or reminder.
 */
export function OldInvoiceRebuild({
  onDone,
  onError,
}: Readonly<{
  onDone: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const data = useQuery(api.ledgerReconstruction.preview, {});
  const saveChecked = useMutation(api.ledgerReconstruction.saveChecked);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (!data || data.invoices.length === 0) return null;
  const reviews = new Map(data.reviews.map((review) => [review.key, review]));

  return (
    <div className="card mt-4">
      <div className="border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-ink-2 uppercase py-2">
          Rebuild old invoices
        </h2>
      </div>
      <p className="px-4 pt-3 text-xs text-ink-2 max-w-160">
        Each old invoice as your old records describe it. Anything the old
        records do not have is listed under &quot;Not in the old records&quot;;
        nothing is made up. Saving a check keeps it here only; it does not make
        an invoice, take a payment or send anything.
      </p>
      <ul className="divide-y divide-line">
        {data.invoices.map((invoice) => {
          const review = reviews.get(invoice.key);
          const changed =
            review != null && review.unpaidBalance !== invoice.unpaidBalance;
          return (
            <li key={invoice.key} className="px-4 py-3">
              <details>
                <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 cursor-pointer text-sm">
                  <span className="font-medium">
                    {invoice.invoiceNumber
                      ? `Invoice ${invoice.invoiceNumber}`
                      : "No invoice number"}
                  </span>
                  <span className="text-ink-2">
                    {invoice.eventTitle ?? invoice.sourceEventIds.join(", ")}
                  </span>
                  <span>
                    Total {formatMoney(invoice.total, invoice.currency.code)}
                  </span>
                  <span>
                    Paid {formatMoney(invoice.paid, invoice.currency.code)}
                  </span>
                  <span>
                    Still owed{" "}
                    {formatMoney(invoice.unpaidBalance, invoice.currency.code)}
                  </span>
                  <span className="text-ink-3">
                    {invoice.missing.length} not in the old records
                  </span>
                  {review ? (
                    <span className={changed ? "text-warn" : "text-ok"}>
                      {changed
                        ? "Changed since checked"
                        : `Checked${review.checkedBy ? ` by ${review.checkedBy}` : ""}${review.checkedAt ? ` ${formatDate(review.checkedAt)}` : ""}`}
                    </span>
                  ) : null}
                </summary>
                <InvoiceDetail invoice={invoice} />
                <button
                  type="button"
                  className="btn btn-sm mt-3"
                  disabled={busyKey != null}
                  onClick={() => {
                    setBusyKey(invoice.key);
                    void saveChecked({ key: invoice.key })
                      .then(() => onDone("Old invoice saved as checked."))
                      .catch((cause: unknown) =>
                        onError(
                          cause instanceof Error
                            ? cause.message
                            : "Couldn't save that check.",
                        ),
                      )
                      .finally(() => setBusyKey(null));
                  }}
                >
                  {busyKey === invoice.key ? "Saving…" : "Save as checked"}
                </button>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InvoiceDetail({
  invoice,
}: Readonly<{ invoice: ReconstructedInvoice }>) {
  const money = (value: number | null) =>
    formatMoney(value, invoice.currency.code);
  const groups: [string, ReconstructedMoney[]][] = [
    ["Deposits", invoice.deposits],
    ["Payments", invoice.payments],
    ["Paid back", invoice.refunds],
    ["Credits", invoice.credits],
    ["Fees and tips (not owed by the client)", invoice.feesAndTips],
    ["Counted once (same money in another report)", invoice.countedOnce],
  ];
  return (
    <div className="mt-3 grid gap-3 text-xs text-ink-2 sm:grid-cols-2">
      <div>
        <p>
          Total: {money(invoice.total)}
          {invoice.totalFrom ? ` (from ${invoice.totalFrom})` : ""}
        </p>
        <p>Tax: {money(invoice.taxAmount)}</p>
        <p>Service charge: {money(invoice.serviceCharge)}</p>
        <p>
          Counts from:{" "}
          {invoice.effectiveDate ? formatDate(invoice.effectiveDate) : "—"}
        </p>
        {invoice.oldBalance != null ? (
          <p>Old balance line: {money(invoice.oldBalance)}</p>
        ) : null}
        {invoice.lines.length > 0 ? (
          <>
            <p className="mt-2 font-medium text-ink">
              Lines{invoice.linesFrom ? ` (from ${invoice.linesFrom})` : ""}
            </p>
            <ul>
              {invoice.lines.map((line, index) => (
                <li key={`${line.description}-${index}`}>
                  {line.description}: {money(line.amount)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div>
        {groups
          .filter(([, items]) => items.length > 0)
          .map(([title, items]) => (
            <div key={title} className="mb-2">
              <p className="font-medium text-ink">{title}</p>
              <ul>
                {items.map((item) => (
                  <li key={item.rowId}>
                    {money(item.amount)}
                    {item.date ? ` on ${formatDate(item.date)}` : ""} (row{" "}
                    {item.rowId})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        <p className="font-medium text-ink">Not in the old records</p>
        <ul className="list-disc pl-4">
          {invoice.missing.map((piece) => (
            <li key={piece}>{piece}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
