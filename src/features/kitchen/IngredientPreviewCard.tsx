import type { Doc } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";

/** Key ingredient fields for a hover preview — no navigation required. */
export function IngredientPreviewCard({
  ingredient,
}: {
  ingredient: Doc<"ingredients">;
}) {
  const allergens = ingredient.allergens ?? [];
  return (
    <span className="block space-y-1.5">
      <DishPrimaryImage
        storageId={ingredient.primaryImageStorageId}
        alt={ingredient.name}
        size="thumb"
        className="mb-1"
      />
      <span className="block text-base font-medium text-ink">
        {ingredient.name}
      </span>
      <span className="block text-xs text-ink-3 capitalize">
        {ingredient.category ? `${ingredient.category} · ` : ""}
        {ingredient.isGlutenFree ? "Gluten free · " : ""}
        {formatStatusLabel(ingredient.status)}
      </span>
      <span className="block text-sm text-ink-2">
        {formatMoney(ingredient.costPerUnit)} / {ingredient.unit}
      </span>
      {allergens.length > 0 && (
        <span className="block text-sm text-ink-2">
          Allergens: {allergens.map((a) => formatStatusLabel(a)).join(", ")}
        </span>
      )}
    </span>
  );
}
