/**
 * Normalized identity fingerprint for a finished recipe formula.
 *
 * AC-067: repeated exports and identical scaled copies of one formula must
 * deduplicate, while distinct formulas stay separate. The fingerprint is built
 * from what the formula IS — per-yield amounts of each ingredient or nested
 * recipe in the ingredient's own unit — not from the raw pasted text, so a
 * batch scaled 2x still matches and a corrected quantity no longer does.
 * Ingredient lines are keyed by resolved name (lowercased), so a re-import
 * that matched the same catalog items under new ingredient rows still agrees.
 */

export interface RecipeIdentityLine {
  kind: "ingredient" | "subrecipe";
  /** Ingredient name (resolved, any case) or the nested recipe's component id. */
  refId: string;
  quantity: number;
  unit: string;
  wasteFactor?: number;
}

export interface RecipeIdentityInput {
  yieldQuantity: number;
  yieldUnit: string;
  lines: RecipeIdentityLine[];
}

/** Rounds away float noise so 1/3 and 0.3333333 ratio drift still agrees. */
function perYield(
  quantity: number,
  wasteFactor: number | undefined,
  yieldQuantity: number,
): string {
  const ratio = (quantity * (wasteFactor ?? 1)) / yieldQuantity;
  return (Math.round(ratio * 1e6) / 1e6).toFixed(6);
}

/**
 * Deterministic fingerprint of the normalized formula: `rid-<hash>-<part
 * count>`. Line order is irrelevant to a formula, so lines are sorted before
 * hashing; the same lines in a different order stay the same recipe.
 */
export function recipeIdentityFingerprint(input: RecipeIdentityInput): string {
  const parts = input.lines
    .map((line) => ({
      kind: line.kind,
      ref:
        line.kind === "subrecipe"
          ? line.refId
          : line.refId.trim().toLowerCase(),
      unit: line.unit,
      perYield: perYield(line.quantity, line.wasteFactor, input.yieldQuantity),
    }))
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.ref.localeCompare(b.ref) ||
        a.unit.localeCompare(b.unit),
    )
    .map((line) => `${line.kind}:${line.ref}@${line.perYield}${line.unit}`);
  let hash = 5381;
  const basis = `${parts.join("|")}#yield:${input.yieldUnit}`;
  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 33) ^ basis.charCodeAt(index);
  }
  return `rid-${(hash >>> 0).toString(16).padStart(8, "0")}-${parts.length}`;
}
