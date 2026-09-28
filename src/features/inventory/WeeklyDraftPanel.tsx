import { Link } from "react-router-dom";
import { formatDate } from "../../lib/format";
import type { WeeklyDraftLineView } from "./weeklyDraftView";

const plural = (count: number, unit: string) =>
  count === 1 ? unit : `${unit}s`;

/** Plain words for how far the order has gone toward the vendor. */
export function draftCommitmentLabel(status: string): string {
  if (status === "draft")
    return "Draft · not sent to the vendor. Event changes update it; nothing is sent until you send it.";
  if (status === "pending_approval") return "Waiting for manager approval";
  if (status === "submitted")
    return "Sent to the vendor · later changes show as a review item";
  if (status === "confirmed") return "Vendor confirmed";
  if (status === "partially_received") return "Partly received";
  if (status === "received") return "Received";
  if (status === "cancelled") return "Cancelled";
  return status.replace(/_/g, " ");
}

/**
 * BE-10.6 (AC-483): purchasing opens on the week's automatic draft and shows
 * every line's need, stock, amount to buy, order, receipts, the events behind
 * it, buyer changes, pack rounding and anything that needs a look.
 */
export function WeeklyDraftPanel({
  order,
  vendorName,
  lines,
  ingredientName,
  eventName,
}: {
  order: { _id: string; status: unknown; sourceRangeStart?: number | null };
  vendorName: string;
  lines: readonly WeeklyDraftLineView[];
  ingredientName: (id: string) => string;
  eventName: (id: string) => string;
}) {
  const folio = `/inventory/orders/${order._id}`;
  return (
    <section className="working-ledger mt-6" aria-label="This week's draft">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">
            Week of{" "}
            {order.sourceRangeStart ? formatDate(order.sourceRangeStart) : "—"}{" "}
            · {vendorName}
          </p>
          <h2>This week's draft order</h2>
          <p className="text-ink-2" data-testid="draft-commitment">
            {draftCommitmentLabel(String(order.status))}
          </p>
        </div>
        <Link className="btn btn-primary btn-sm" to={folio}>
          Review &amp; send →
        </Link>
      </div>
      {lines.length === 0 ? (
        <div className="document-empty">
          <p>Nothing to buy on this draft right now</p>
          <span>Approved events add their shortages here by themselves.</span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="supply-number">Needed</th>
                <th className="supply-number">From stock</th>
                <th className="supply-number">On other orders</th>
                <th className="supply-number">To buy</th>
                <th className="supply-number">Ordering</th>
                <th className="supply-number">Received</th>
                <th className="supply-number">Still to come</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <DraftLineRows
                  key={line.lineId}
                  line={line}
                  folio={folio}
                  ingredientName={ingredientName}
                  eventName={eventName}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DraftLineRows({
  line,
  folio,
  ingredientName,
  eventName,
}: {
  line: WeeklyDraftLineView;
  folio: string;
  ingredientName: (id: string) => string;
  eventName: (id: string) => string;
}) {
  const unit = line.unit;
  const { rounding } = line;
  return (
    <>
      <tr data-testid="draft-line">
        <td>
          <strong>{ingredientName(line.ingredientId)}</strong>
        </td>
        <td className="supply-number">
          {line.needed} {unit}
        </td>
        <td className="supply-number">{line.fromStock}</td>
        <td className="supply-number">{line.onOtherOrders}</td>
        <td className="supply-number">{line.toBuy}</td>
        <td className="supply-number">{line.ordering}</td>
        <td className="supply-number">{line.received}</td>
        <td className="supply-number">{line.stillToCome}</td>
      </tr>
      <tr data-testid="draft-line-detail">
        <td colSpan={8}>
          <div className="flex flex-col gap-1 text-sm text-ink-2">
            {line.events.length > 0 ? (
              <span>
                For:{" "}
                {line.events
                  .map(
                    (share) =>
                      `${eventName(share.eventId)} ${share.quantity} ${share.unit}`,
                  )
                  .join(" · ")}
              </span>
            ) : (
              <span>Added by hand · not from an event</span>
            )}
            <span>
              {line.buyerChanged
                ? `Automatic amount ${line.toBuy} ${unit} · you changed it to ${line.ordering} ${unit}, and event changes keep your number`
                : `Automatic amount · follows event changes`}
            </span>
            {rounding ? (
              <span>
                Sold by the {rounding.packUnit} ({rounding.packSize} {unit}):{" "}
                {rounding.packs} {plural(rounding.packs, rounding.packUnit)} ={" "}
                {rounding.roundedQuantity} {unit}
                {rounding.extra > 0 ? `, ${rounding.extra} ${unit} extra` : ""}
                {line.ordering === rounding.roundedQuantity
                  ? " · ordering whole packs"
                  : " · you can round up on the order"}
              </span>
            ) : line.toBuy > 0 ? (
              <span>
                No pack size recorded, so the exact amount is ordered.
              </span>
            ) : null}
            {line.exceptions.map((issue, index) => (
              <span key={index} role="status">
                {issue.eventId ? `${eventName(issue.eventId)}: ` : ""}
                {issue.reason}{" "}
                <Link className="underline font-medium" to={folio}>
                  Look at it on the order
                </Link>
              </span>
            ))}
          </div>
        </td>
      </tr>
    </>
  );
}
