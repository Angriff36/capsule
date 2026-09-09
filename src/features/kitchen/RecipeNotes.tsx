/** Translate worksheet notes into kitchen copy; provenance stays in storage. */
function kitchenUnits(text: string): string {
  return text
    .replace(/Oz\s*[-–]\s*Fld/gi, "fl oz")
    .replace(/Oz\s*[-–]\s*Dry/gi, "oz")
    .replace(/\b(Pound|Melon|Cup|Quart|Each|Serving|Gram)s?\b/g, (unit) =>
      unit.toLowerCase(),
    );
}
export function recipeNoteLines(
  text: string,
  title?: string,
  ingredientNote = false,
): string[] {
  const imported = /TPP:|\[TPP (?:dish recipe|subrecipe):/.test(text);
  const clean = text.replace(/\[TPP [^\]]+\]/g, "");
  const result: string[] = [];
  for (const [index, sourceLine] of clean.split(/\r?\n/).entries()) {
    let line = sourceLine;
    line = line.split(/TPP:/i)[0].trim();
    if (!line || /TPP:|\b[^\s]+\.xlsx?\b/i.test(line)) continue;
    if (imported) {
      if (/^Qty\s*\||^Sub Recipes?\(s\)|^Method:$/i.test(line)) continue;
      if (
        index === 0 &&
        !ingredientNote &&
        /^[\d\s./]+\s+.*\sper\s+[\d\s./]+\s/i.test(line)
      )
        continue;
      if (index === 0 && ingredientNote)
        line = line.replace(/:\s*[\d\s./]+\s+.*\sper\s+[\d\s./]+\s+.*$/i, "");
      line = line.replace(/^(?:Recipe )?Yields?:\s*/i, "Makes ");
      if (line.toLowerCase() === title?.trim().toLowerCase()) continue;
      if (line.includes("|")) {
        const cells = line.split("|").map((cell) => cell.trim());
        if (cells.length >= 3 && /^[\d\s./]+$/.test(cells[0])) {
          const [quantity, unit, ...description] = cells;
          line = `${description.filter(Boolean).join(", ")} — ${quantity} ${unit}`;
        }
      }
    }
    line = kitchenUnits(line.replace(/^Method:\s*/i, ""));
    if (line && !result.includes(line)) result.push(line);
  }
  return result;
}
/** Fractions reflect the same four-decimal storage precision used by recipes. */
export function readableRecipeAmount(quantity: number, unit: string): string {
  const scale = unit === "quart" && quantity < 1 ? 32 : 1;
  const amount = quantity * scale;
  let copy = String(Number(amount.toFixed(4)));
  for (const denominator of [1, 2, 3, 4, 8, 16, 32]) {
    const numerator = Math.round(amount * denominator);
    if (
      numerator <= 0 ||
      Math.abs(numerator / denominator - amount) > 0.000051 * scale
    )
      continue;
    const whole = Math.floor(numerator / denominator);
    const remainder = numerator % denominator;
    copy = remainder
      ? `${whole ? `${whole} ` : ""}${remainder}/${denominator}`
      : String(whole);
    break;
  }
  const labels: Record<string, string> = {
    ounce: "oz",
    pound: "lb",
    tablespoon: "tbsp",
    teaspoon: "tsp",
  };
  const label = scale === 32 ? "fl oz" : (labels[unit] ?? unit);
  return `${copy} ${label}`;
}
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
