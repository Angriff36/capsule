import type { EventStockShortage } from "../events/EventStockReservationCoordinator";
import { formatMoneyExact } from "../../lib/format";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import {
  rankIngredientSubstitutions,
  type SubstitutionIngredient,
  type SubstitutionInventoryItem,
  type SubstitutionReservation,
} from "./IngredientSubstitution";

type Props = {
  shortages: readonly EventStockShortage[];
  ingredients: readonly SubstitutionIngredient[];
  inventoryItems: readonly SubstitutionInventoryItem[];
  reservations: readonly SubstitutionReservation[];
  onDismiss: () => void;
};

function costDeltaLabel(delta: number, unit: string) {
  if (Math.abs(delta) < 0.005) return `same cost / ${unit}`;
  return `${delta > 0 ? "+" : "−"}${formatMoneyExact(Math.abs(delta))} / ${unit}`;
}

/** Surfaces reservation shortfalls after menu-driven demand reconcile. */
export function EventMenuStockShortageBanner({
  shortages,
  ingredients,
  inventoryItems,
  reservations,
  onDismiss,
}: Props) {
  if (shortages.length === 0) return null;
  return (
    <div className="mt-4 card border-danger/40 px-3 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-danger">
            Stock shortages · substitute options
          </p>
          <p className="mt-1 text-ink-2">
            Component demand could not be fully held. Mapped alternatives are
            ranked for the kitchen; the source component has not been changed.
          </p>
          <ul className="mt-3 space-y-3 text-ink-2">
            {shortages.map((row) => {
              const ingredient = ingredients.find(
                (candidate) => candidate.id === row.ingredientId,
              );
              const mappedCount =
                ingredient?.substituteIngredientIds?.length ?? 0;
              const suggestions = rankIngredientSubstitutions({
                sourceIngredientId: row.ingredientId,
                shortageQuantity: row.shortageQuantity,
                shortageUnit: row.unit,
                ingredients,
                inventoryItems,
                reservations,
              });
              return (
                <li
                  key={`${row.ingredientId}:${row.unit}`}
                  className="rounded-xl border border-danger/20 bg-paper px-3 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-ink">
                      <CulinaryEntityLink
                        kind="ingredient"
                        id={row.ingredientId}
                      >
                        {ingredient?.name ?? row.ingredientId}
                      </CulinaryEntityLink>
                    </strong>
                    <span className="font-mono text-[11px] text-danger">
                      Short {row.shortageQuantity} {row.unit} · held{" "}
                      {row.reservedQuantity} of {row.requiredQuantity}
                    </span>
                  </div>

                  {suggestions.length ? (
                    <ol
                      className="mt-3 space-y-2"
                      aria-label={`Ranked substitutes for ${ingredient?.name ?? row.ingredientId}`}
                    >
                      {suggestions.map((suggestion, index) => (
                        <li
                          key={suggestion.ingredientId}
                          className="grid gap-1 border-t border-line pt-2 sm:grid-cols-[2rem_1fr_auto] sm:items-center"
                        >
                          <span className="font-mono text-[10px] text-ink-3">
                            #{index + 1}
                          </span>
                          <div>
                            <CulinaryEntityLink
                              kind="ingredient"
                              id={suggestion.ingredientId}
                            >
                              {suggestion.name}
                            </CulinaryEntityLink>
                            <p className="mt-1 text-[11px] text-ink-3">
                              {suggestion.availableQuantity} {suggestion.unit}{" "}
                              available · covers {suggestion.coverageQuantity}{" "}
                              {suggestion.unit}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            <span
                              className={
                                suggestion.allergenCompatible
                                  ? "chip border-ok/30 bg-ok-soft text-ok"
                                  : "chip border-warn/30 bg-warn-soft text-warn"
                              }
                            >
                              {suggestion.allergenCompatible
                                ? "No new allergens"
                                : `Adds ${suggestion.newAllergens.join(", ")}`}
                            </span>
                            <span className="chip border-line-2 bg-inset text-ink-2">
                              {costDeltaLabel(
                                suggestion.costDelta,
                                suggestion.unit,
                              )}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-[11px] text-ink-3">
                      {mappedCount
                        ? "Mapped substitutes have no unreserved stock in this unit."
                        : "No substitutes are mapped for this ingredient yet."}
                    </p>
                  )}
                </li>
              );
            })}
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
