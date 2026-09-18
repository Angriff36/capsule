/**
 * "This dish is sized for 15 of 30 guests" — the Ops Final Lock walk of
 * quantities against guest count, done for the reader (#368 item 13). A line
 * with its own food-cost headcount override is treated as deliberately sized
 * and not hinted; zero servings is an 86, not a shortfall.
 */
export type HeadcountHint = {
  kind: "below" | "above";
  text: string;
  /** A ready-to-use review-flag question for this line. */
  question: string;
};

export function eventMenuHeadcountHint(input: {
  dishName: string;
  quantityServings: number;
  expectedHeadcount?: number | null;
  headcountOverride?: number | null;
}): HeadcountHint | null {
  const { dishName, quantityServings, expectedHeadcount } = input;
  if (
    expectedHeadcount == null ||
    !(expectedHeadcount > 0) ||
    !(quantityServings > 0)
  )
    return null;
  if ((input.headcountOverride ?? 0) > 0) return null;
  if (quantityServings < expectedHeadcount) {
    return {
      kind: "below",
      text: `Sized for ${quantityServings} of ${expectedHeadcount} guests`,
      question: `${dishName}: ${quantityServings} servings for a ${expectedHeadcount}-guest event. Intentional (partial course / side option) or short?`,
    };
  }
  if (quantityServings >= expectedHeadcount * 2) {
    return {
      kind: "above",
      text: `${quantityServings} servings for ${expectedHeadcount} guests`,
      question: `${dishName}: ${quantityServings} servings for ${expectedHeadcount} guests — pieces-per-guest count, or a source-document mismatch?`,
    };
  }
  return null;
}
