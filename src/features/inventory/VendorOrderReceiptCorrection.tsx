import { useState, type FormEvent } from "react";
import {
  useListReceiptCorrection,
  useVendorOrderLineCorrectReceipt,
} from "../../lib/manifest-convex-react";

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

type ListedCorrection = {
  _id: string;
  vendorOrderLineId: string;
  priorReceivedQuantity: number;
  correctedReceivedQuantity: number;
  unit: string;
  reason: string;
  correctionSequence: number;
  deletedAt?: unknown;
};

const CORRECTABLE_ORDER = new Set([
  "confirmed",
  "partially_received",
  "received",
]);

function correctionsForLine(
  rows: ListedCorrection[] | undefined,
  lineId: string,
): ListedCorrection[] {
  return (rows ?? [])
    .filter((row) => row.deletedAt == null && row.vendorOrderLineId === lineId)
    .sort((left, right) => left.correctionSequence - right.correctionSequence);
}

function CorrectionHistory({ rows }: { rows: ListedCorrection[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="receipt-lot-history" aria-label="Count corrections">
      <span>Count corrections</span>
      <ul>
        {rows.map((row) => (
          <li key={row._id}>
            <strong>
              {Number(row.priorReceivedQuantity)} →{" "}
              {Number(row.correctedReceivedQuantity)} {row.unit}
            </strong>
            <span>{row.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Buyer corrects a received count. The original supplier lot stays as first recorded. */
export function VendorOrderReceiptCorrection({
  line,
  orderStatus,
  latestLotNumber,
  busy,
  run,
}: ReceiptCorrectionProps) {
  const correctReceipt = useVendorOrderLineCorrectReceipt();
  const listed = useListReceiptCorrection() as ListedCorrection[] | undefined;
  const history = correctionsForLine(listed, line._id);
  const [open, setOpen] = useState(false);
  const received = Number(line.receivedQuantity);
  const canCorrect =
    CORRECTABLE_ORDER.has(orderStatus) &&
    (line.status === "receiving" || line.status === "complete") &&
    received > 0;
  if (!canCorrect && history.length === 0) return null;

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

  return (
    <>
      <CorrectionHistory rows={history} />
      {canCorrect && !open ? (
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
      ) : null}
      {canCorrect && open ? (
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
            {busy === `${line._id}:correct`
              ? "Saving…"
              : "Save corrected count"}
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
      ) : null}
    </>
  );
}
