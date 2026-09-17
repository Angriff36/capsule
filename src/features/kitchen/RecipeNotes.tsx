import { recipeNoteLines } from "../../lib/recipeDisplay";
export { recipeNoteLines, readableRecipeAmount } from "../../lib/recipeDisplay";

export function RecipeNotes({
  text,
  title,
  ingredientNote = false,
}: {
  text?: string | null;
  title?: string;
  ingredientNote?: boolean;
}) {
  const lines = text ? recipeNoteLines(text, title, ingredientNote) : [];
  if (!lines.length) return null;
  return (
    <div className="recipe-note">
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
}
