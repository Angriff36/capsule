import { useTastingPrepList } from "../../lib/useTastings";
import { TableSkeleton } from "../../ui/primitives";

/**
 * The kitchen's small prep list for one tasting: what to plate, how much,
 * which recipe parts to make, and the dish's prep steps. Read-only; a
 * tasting never adds to event demand.
 */
export function TastingPrepList({ tastingId }: { tastingId: string }) {
  const prep = useTastingPrepList(tastingId);
  return (
    <div className="mt-4">
      <p className="eyebrow">Tasting prep list</p>
      {prep === undefined ? (
        <TableSkeleton rows={2} />
      ) : prep.length === 0 ? (
        <p className="mt-2 text-base text-ink-2">
          Add sample dishes to build the prep list.
        </p>
      ) : (
        <ul className="mt-2 grid gap-3">
          {prep.map((dish) => (
            <li key={dish.tastingDishId}>
              <p className="text-base font-semibold text-ink">
                {dish.dishName} — {dish.portions}{" "}
                {dish.portions === 1 ? "portion" : "portions"} (
                {Number(dish.totalAmount.toFixed(2))}{" "}
                {dish.totalAmount !== 1 &&
                ["serving", "portion", "piece"].includes(dish.portionUnit)
                  ? `${dish.portionUnit}s`
                  : dish.portionUnit}{" "}
                total)
              </p>
              {dish.allergens.length > 0 ? (
                <p className="text-sm text-ink-2">
                  Allergens: {dish.allergens.join(", ")}
                </p>
              ) : null}
              {dish.components.length > 0 ? (
                <p className="text-sm text-ink-2">
                  Recipe parts:{" "}
                  {dish.components
                    .map((part) =>
                      part.piecesNeeded != null
                        ? `${part.name} (${Number(part.piecesNeeded.toFixed(2))} pieces)`
                        : part.name,
                    )
                    .join(", ")}
                </p>
              ) : null}
              {dish.steps.length > 0 ? (
                <ol className="mt-1 list-decimal pl-5 text-sm text-ink-2">
                  {dish.steps.map((step, index) => (
                    <li key={`${dish.tastingDishId}:${index}`}>
                      {step.name}
                      {step.station ? ` · ${step.station}` : ""}
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
