import type { EventStockShortage } from "../events/EventStockReservationCoordinator";

type Props = {
  shortages: readonly EventStockShortage[];
  ingredientName: (ingredientId: string) => string;
  onDismiss: () => void;
};

/** Surfaces reservation shortfalls after menu-driven demand reconcile. */
export function EventMenuStockShortageBanner({
  shortages,
  ingredientName,
  onDismiss,
}: Props) {
  if (shortages.length === 0) return null;
  return (
    <div className="mt-4 card border-danger/40 px-3 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-danger">Stock reservation shortages</p>
          <p className="mt-1 text-ink-2">
            Demand increased after stock was reserved, but not all additional
            quantity could be held.
          </p>
          <ul className="mt-2 list-disc pl-5 text-ink-2">
            {shortages.map((row) => (
              <li key={`${row.ingredientId}:${row.unit}`}>
                {ingredientName(row.ingredientId)}: short {row.shortageQuantity}{" "}
                {row.unit} (need {row.requiredQuantity}, held{" "}
                {row.reservedQuantity})
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
