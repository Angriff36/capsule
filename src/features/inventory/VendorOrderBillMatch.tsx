import { formatMoneyExact } from "../../lib/format";
import { useState, type FormEvent } from "react";
import {
  useVendorOrderLineCorrectBillMatch,
  useVendorOrderLineMatchBill,
  useVendorOrderLineReviewBillDifference,
} from "../../lib/manifest-convex-react";
import { useBillMatchesForLine } from "../facilities/useLogisticsWindow";

type BillLine = {
  _id: string;
  version: number;
  status: string;
  receivedQuantity: number;
  unitCost: number;
  unit: string;
  billNumber?: string | null;
  billedQuantity?: number | null;
  billedUnitPrice?: number | null;
  billMatchState?: string | null;
  billReviewState?: string | null;
  billReviewNote?: string | null;
};

type BillMatchProps = {
  line: BillLine;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
};

type ListedMatch = {
  _id: string;
  vendorOrderLineId: string;
  billNumber: string;
  billedQuantity: number;
  billedUnitPrice: number;
  matchState: string;
  matchSequence: number;
  reason?: string | null;
  reviewState?: string | null;
  deletedAt?: unknown;
};

/** The named exception for a bill that does not agree with the receipt. */
export function billDifferenceText(
  state: string | null | undefined,
  billed: number,
  received: number,
  unit: string,
): string {
  const amount =
    billed > received
      ? `Billed for ${billed - received} ${unit} more than arrived`
      : `Billed for ${received - billed} ${unit} less than arrived`;
  if (state === "quantity_differs") return amount;
  if (state === "price_differs") return "Billed price is not the receipt price";
  if (state === "quantity_and_price_differ")
    return `${amount}, and the billed price is not the receipt price`;
  return "Bill agrees with the delivery";
}

const REVIEW_WORDS: Record<string, string> = {
  open: "Needs a decision",
  accepted: "Accepted",
  disputed: "Disputed with the vendor",
};

function BillHistory({ rows }: { rows: ListedMatch[] }) {
  if (rows.length < 2) return null;
  return (
    <div className="receipt-lot-history" aria-label="Bill match history">
      <span>Earlier bill matches</span>
      <ul>
        {rows.slice(0, -1).map((row) => (
          <li key={row._id}>
            <strong>
              Bill {row.billNumber}: {Number(row.billedQuantity)} at{" "}
              {formatMoneyExact(Number(row.billedUnitPrice))}
            </strong>
            <span>
              {row.reviewState ? REVIEW_WORDS[row.reviewState] : "Matched"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BillFields({ line }: { line: BillLine }) {
  return (
    <>
      <label className="field-label">
        Bill number
        <input
          name="billNumber"
          className="input"
          defaultValue={line.billNumber ?? ""}
          autoComplete="off"
          required
        />
      </label>
      <label className="field-label">
        Billed amount ({line.unit})
        <input
          name="billedQuantity"
          type="number"
          min={0}
          step="any"
          className="input"
          defaultValue={line.billedQuantity ?? Number(line.receivedQuantity)}
          required
        />
      </label>
      <label className="field-label">
        Billed price per unit
        <input
          name="billedUnitPrice"
          type="number"
          min={0}
          step="0.01"
          className="input"
          defaultValue={line.billedUnitPrice ?? Number(line.unitCost)}
          required
        />
      </label>
    </>
  );
}

/** Buyer matches the vendor's bill to a received line, and settles any difference. */
export function VendorOrderBillMatch({ line, busy, run }: BillMatchProps) {
  const matchBill = useVendorOrderLineMatchBill();
  const correctBill = useVendorOrderLineCorrectBillMatch();
  const reviewBill = useVendorOrderLineReviewBillDifference();
  const listed = useBillMatchesForLine(line._id) as ListedMatch[] | undefined;
  const [mode, setMode] = useState<"closed" | "match" | "fix">("closed");
  const received = Number(line.receivedQuantity);
  const canMatch =
    (line.status === "receiving" || line.status === "complete") && received > 0;
  if (!canMatch && !line.billNumber) return null;

  const history = (listed ?? [])
    .filter(
      (row) => row.deletedAt == null && row.vendorOrderLineId === line._id,
    )
    .sort((left, right) => left.matchSequence - right.matchSequence);

  const values = (data: FormData) => ({
    billNumber: String(data.get("billNumber") ?? "").trim(),
    billedQuantity: Number(data.get("billedQuantity")),
    billedUnitPrice: Number(data.get("billedUnitPrice")),
  });

  const submitMatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(`${line._id}:bill`, async () => {
      if (mode === "fix") {
        await correctBill({
          docId: line._id,
          version: line.version,
          ...values(data),
          reason: String(data.get("reason") ?? "").trim(),
        });
      } else {
        await matchBill({
          docId: line._id,
          version: line.version,
          ...values(data),
        });
      }
      setMode("closed");
    });
  };

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const decision =
      submitter instanceof HTMLButtonElement ? submitter.value : "accepted";
    void run(`${line._id}:billReview`, async () => {
      await reviewBill({
        docId: line._id,
        version: line.version,
        decision,
        note: String(data.get("note") ?? "").trim(),
      });
    });
  };

  const differs =
    line.billMatchState != null && line.billMatchState !== "matched";

  return (
    <div className="receipt-lot-history" aria-label="Vendor bill">
      <span>Vendor bill</span>
      {line.billNumber ? (
        <ul>
          <li>
            <strong>
              Bill {line.billNumber}: {Number(line.billedQuantity)} {line.unit}{" "}
              at {formatMoneyExact(Number(line.billedUnitPrice))}
            </strong>
            <span>
              {billDifferenceText(
                line.billMatchState,
                Number(line.billedQuantity),
                received,
                line.unit,
              )}
              {differs && line.billReviewState
                ? ` · ${REVIEW_WORDS[line.billReviewState] ?? ""}`
                : ""}
              {line.billReviewNote ? ` · ${line.billReviewNote}` : ""}
            </span>
          </li>
        </ul>
      ) : null}
      <BillHistory rows={history} />
      {differs && mode === "closed" ? (
        <form className="receipt-form" onSubmit={submitReview}>
          <label className="field-label">
            Why you accept or dispute it
            <input
              name="note"
              className="input"
              defaultValue={line.billReviewNote ?? ""}
              required
            />
          </label>
          <button
            className="btn btn-primary btn-sm"
            value="accepted"
            disabled={busy != null}
          >
            Accept the bill
          </button>
          <button
            className="btn btn-ghost btn-sm"
            value="disputed"
            disabled={busy != null}
          >
            Dispute with the vendor
          </button>
        </form>
      ) : null}
      {mode === "closed" ? (
        <div className="supply-row-actions">
          {!line.billNumber && canMatch ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy != null}
              onClick={() => setMode("match")}
            >
              Match the bill
            </button>
          ) : null}
          {line.billNumber ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy != null}
              onClick={() => setMode("fix")}
            >
              Fix the bill match
            </button>
          ) : null}
        </div>
      ) : (
        <form className="receipt-form" onSubmit={submitMatch}>
          <BillFields line={line} />
          {mode === "fix" ? (
            <label className="field-label">
              Why the bill match changed
              <input name="reason" className="input" required />
            </label>
          ) : null}
          <button className="btn btn-primary" disabled={busy != null}>
            {busy === `${line._id}:bill` ? "Saving…" : "Save bill match"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy != null}
            onClick={() => setMode("closed")}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
