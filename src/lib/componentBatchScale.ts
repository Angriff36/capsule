/** Express a measured portion as an exact batch-to-servings ratio for the
 * existing DishComponent contract. Both amounts use the component yield unit.
 * Example: 0.0234375 gal per guest / 5 gal = 3 batches per 640 guests.
 */
export function componentBatchScale(
  yieldQuantity: number,
  quantityPerServing: number,
) {
  const scale = 100_000_000;
  const integers = [yieldQuantity, quantityPerServing].map((value) => {
    const integer = Math.round(value * scale);
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      !Number.isSafeInteger(integer) ||
      integer <= 0 ||
      Math.abs(integer / scale - value) > 1e-12
    )
      throw new Error(
        "Recipe amounts require a positive measured value with at most eight decimals",
      );
    return integer;
  });
  let a = integers[0];
  let b = integers[1];
  while (b) [a, b] = [b, a % b];
  const servings = integers[0] / a;
  const batches = integers[1] / a;
  if (servings > 99_999_999 || batches > 999_999)
    throw new Error(
      "Measured recipe ratio exceeds the attachment quantity range",
    );
  return { yieldQuantity: servings, batchMultiplier: batches };
}
