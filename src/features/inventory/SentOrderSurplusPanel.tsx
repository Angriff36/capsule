import { Link } from "react-router-dom";
import type { SentOrderSurplus } from "./sentOrderSurplus";

/** Sent orders that are now more than the events need (BE-10.5). */
export function SentOrderSurplusPanel({
  rows,
  eventName,
  ingredientName,
}: {
  rows: readonly SentOrderSurplus[];
  eventName: (id: string) => string;
  ingredientName: (id: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      className="working-ledger mt-6"
      aria-label="Sent orders now more than needed"
    >
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Already sent</p>
          <h2>Sent orders now more than needed</h2>
        </div>
        <span>{rows.length} to check</span>
      </div>
      <p className="text-ink-2">
        These orders went out before the event changed. Capsule does not change
        a sent order. Call the vendor to cut the line, or keep the extra as
        stock when it arrives.
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.needId}>
            <strong>
              {eventName(row.eventId)} · {ingredientName(row.ingredientId)}
            </strong>{" "}
            <span>
              {row.eventCancelled
                ? `Event cancelled. Ordered ${row.orderedFor} ${row.unit}; ${row.extra} ${row.unit} extra.`
                : `Ordered for ${row.orderedFor} ${row.unit}, now needs ${row.nowNeeded} ${row.unit}; ${row.extra} ${row.unit} extra.`}
            </span>{" "}
            <Link
              className="text-link"
              to={`/inventory/orders/${row.vendorOrderId}`}
            >
              Open order →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
