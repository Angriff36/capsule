export type RecipeEquipmentOption = {
  _id: string;
  name: string;
  quantity?: number | null;
  countUnit?: string | null;
  status: string;
  deletedAt?: number | null;
};

const key = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Active equipment on the company list, by name. */
export function activeRecipeEquipment(
  equipment: readonly RecipeEquipmentOption[] | undefined,
) {
  return (equipment ?? [])
    .filter((item) => item.deletedAt == null && item.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A recipe's equipment notes, one piece per line or comma. A piece that names
 * an item on the company equipment list carries that item, so the recipe page
 * can say how many the kitchen has. Other pieces stay as written.
 */
export function recipeEquipmentPieces(
  notes: string,
  equipment: readonly RecipeEquipmentOption[] | undefined,
) {
  const active = activeRecipeEquipment(equipment);
  return notes
    .split(/[\n,]/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      item: active.find((item) => key(item.name) === key(text)) ?? null,
    }));
}

/** The notes with one more list item added on its own line. */
export function addRecipeEquipment(notes: string, name: string) {
  const trimmed = notes.trim();
  if (
    recipeEquipmentPieces(trimmed, undefined).some(
      (p) => key(p.text) === key(name),
    )
  ) {
    return trimmed;
  }
  return trimmed ? `${trimmed}\n${name}` : name;
}
