import { useState, type FormEvent } from "react";
import { useVendorOrderLineCorrectReceipt } from "../../lib/manifest-convex-react";

type CorrectionLine = {
  _id: string;
  version: number;
  status: string;
  receivedQuantity: number;
  orderedQuantity: number;
  unit: string;
};

type ReceiptCorrectionProps = {
  line: CorrectionLine;
  orderStatus: string;
  latestLotNumber: string;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
};

const CORRECTABLE_ORDER = new Set([
  "confirmed",
  "partially_received",
  "received",
]);

/** Buyer corrects a received count. The original supplier lot stays as first recorded. */
export function VendorOrderReceiptCorrection({
  line,
  orderStatus,
  latestLotNumber,
  busy,
  run,
}: ReceiptCorrectionProps) {
  const correctReceipt = useVendorOrderLineCorrectReceipt();
  const [open, setOpen] = useState(false);
  const received = Number(line.receivedQuantity);
  const canCorrect =
    CORRECTABLE_ORDER.has(orderStatus) &&
    (line.status === "receiving" || line.status === "complete") &&
    received > 0;
  if (!canCorrect) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(`${line._id}:correct`, async () => {
      await correctReceipt({
        docId: line._id,
        version: line.version,
        correctedQuantity: Number(data.get("correctedQuantity")),
        reason: String(data.get("reason") ?? "").trim(),
        supplierLotNumber: String(data.get("supplierLotNumber") ?? "").trim(),
      });
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <div className="supply-row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy != null}
          onClick={() => setOpen(true)}
        >
          Correct the count
        </button>
      </div>
    );
  }

  return (
    <form className="receipt-form" onSubmit={submit}>
      <label className="field-label">
        Corrected received count
        <input
          name="correctedQuantity"
          type="number"
          min={0}
          max={Number(line.orderedQuantity)}
          step="any"
          defaultValue={received}
          className="input"
          required
        />
      </label>
      <label className="field-label">
        Supplier lot
        <input
          name="supplierLotNumber"
          className="input"
          defaultValue={latestLotNumber}
          autoComplete="off"
          required
        />
      </label>
      <label className="field-label">
        Why the count changed
        <input name="reason" className="input" required />
      </label>
      <button className="btn btn-primary" disabled={busy != null}>
        {busy === `${line._id}:correct` ? "Saving…" : "Save corrected count"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy != null}
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </form>
  );
}
