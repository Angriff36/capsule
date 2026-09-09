/** Present kitchen instructions without turning import provenance into body copy.
 * Stored source text is left untouched and stays available in a disclosure. */
export function recipeSourceCopy(text: string): string {
  return text.replace(/\[TPP (?:dish recipe|subrecipe):[^\]]+\]/g, "").trim();
}

export function RecipeNotes({
  text,
  label = "Instructions",
}: {
  text?: string | null;
  label?: string;
}) {
  if (!text?.trim()) return null;
  const imported = /TPP:|\[TPP dish recipe:/.test(text);
  const copy = recipeSourceCopy(text);
  if (!imported) return <p className="recipe-note">{copy}</p>;
  return (
    <details className="recipe-source-note">
      <summary>{label}</summary>
      <div className="recipe-source-copy">{copy}</div>
    </details>
  );
}
