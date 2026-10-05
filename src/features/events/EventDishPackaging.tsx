import {
  packagingForEvent,
  type StylePackagingRow,
} from "../kitchen/stylePackaging";

/**
 * How one dish goes out for THIS event: only the packaging line written for
 * the event's service style — the dish's own line first, then the line of
 * each recipe in it. Nothing shows when none is written for that style.
 */
export function EventDishPackaging({
  packaging,
  serviceStyleId,
  serviceStyleName,
  dishId,
  mainDishId,
  recipes,
}: {
  packaging: readonly StylePackagingRow[] | undefined;
  serviceStyleId: string | null | undefined;
  serviceStyleName?: string;
  dishId: string | undefined;
  /** For a dish version: its main dish, whose line it uses when it has none. */
  mainDishId?: string | null;
  /** Recipes in the dish, by id, with the name to show beside their line. */
  recipes: readonly { id: string; name: string }[];
}) {
  if (!dishId) return null;
  const names = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));
  const rows = packagingForEvent(
    packaging,
    serviceStyleId,
    dishId,
    recipes.map((recipe) => recipe.id),
    mainDishId,
  );
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="event-dish-packaging">
      <p className="text-sm font-semibold text-ink">
        Packaging{serviceStyleName ? ` · ${serviceStyleName}` : ""}
      </p>
      {rows.map((row) => (
        <p key={row._id} className="whitespace-pre-line text-base text-ink-2">
          {row.componentId && names.get(row.componentId)
            ? `${names.get(row.componentId)}: `
            : ""}
          {row.instructions}
          {row.container ? ` (goes out in ${row.container})` : ""}
        </p>
      ))}
    </div>
  );
}
