import type { Doc } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";

/** Key ingredient fields for a hover preview — no navigation required. */
export function IngredientPreviewCard({
  ingredient,
}: {
  ingredient: Doc<"ingredients">;
}) {
  const allergens = ingredient.allergens ?? [];
  return (
    <span className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink">
        {ingredient.name}
      </span>
      <span className="block text-[11px] text-ink-3 capitalize">
        {ingredient.category ? `${ingredient.category} · ` : ""}
        {formatStatusLabel(ingredient.status)}
      </span>
      <span className="block text-[12px] text-ink-2">
        {formatMoney(ingredient.costPerUnit)} / {ingredient.unit}
      </span>
      {allergens.length > 0 && (
        <span className="block text-[12px] text-ink-2">
          Allergens: {allergens.map((a) => formatStatusLabel(a)).join(", ")}
        </span>
      )}
    </span>
  );
}
