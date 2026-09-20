import { useState, type FormEvent } from "react";
import { useInvoiceAssignNumber } from "../../lib/manifest-convex-react";

/**
 * Type an invoice number by hand on the invoice detail page. Runs the governed
 * Invoice.assignNumber command, which accepts an issued invoice that is not
 * yet sent. The authored numbering seam rejects a number another live invoice
 * already holds; that message reaches the page's failure banner.
 */
export function InvoiceNumberEditor({
  invoice,
  busy,
  onBusy,
  onSaved,
  onFailure,
}: Readonly<{
  invoice: {
    _id: string;
    version?: number;
    invoiceNumber?: string | null;
    issuedAt?: number | null;
    sentAt?: number | null;
  };
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (invoiceNumber: string) => void;
  onFailure: (error: unknown) => void;
}>) {
  const assignNumber = useInvoiceAssignNumber();
  const [editing, setEditing] = useState(false);
  const saved = String(invoice.invoiceNumber ?? "").trim();
  const issued = invoice.issuedAt != null;
  const sent = invoice.sentAt != null;
  const reason = !issued
    ? "An invoice gets its number when it is issued."
    : sent
      ? "This invoice is already sent. Its number stays as the client received it."
      : undefined;

  if (!editing) {
    return (
      <p className="mt-2 text-xs text-ink-3">
        Invoice number {saved || "not set"}{" "}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || reason != null}
          title={reason}
          onClick={() => setEditing(true)}
        >
          Edit number
        </button>
      </p>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = String(
      new FormData(event.currentTarget).get("invoiceNumber") ?? "",
    ).trim();
    if (!next || next === saved) {
      setEditing(false);
      return;
    }
    onBusy(true);
    void assignNumber({
      docId: invoice._id,
      version: invoice.version,
      invoiceNumber: next,
    })
      .then(() => {
        setEditing(false);
        onSaved(next);
      })
      .catch((error: unknown) => onFailure(error))
      .finally(() => onBusy(false));
  };

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-1"
      onSubmit={submit}
      aria-label="Invoice number"
    >
      <label className="field-label text-xs">
        Invoice number
        <input
          name="invoiceNumber"
          className="input w-40"
          defaultValue={saved}
          placeholder="INV-1042"
          disabled={busy}
          autoComplete="off"
          required
        />
      </label>
      <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? "…" : "Save number"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  );
}
