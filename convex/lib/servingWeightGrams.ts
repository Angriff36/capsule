/** Convert USDA / OFF label serving metadata into grams per catalog "each". */

const GRAMS_PER_OZ = 28.3495;
const GRAMS_PER_LB = 453.592;
const GRAMS_PER_KG = 1000;

function gramsFromAmountAndUnit(amount: number, unit: string): number | undefined {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "g" || normalized === "grm" || normalized === "gram" || normalized === "grams") {
    return amount;
  }
  if (normalized === "mg") return amount / 1000;
  if (normalized === "kg" || normalized === "kilogram") return amount * GRAMS_PER_KG;
  if (normalized === "ml") return amount;
  if (normalized === "oz" || normalized === "ounce" || normalized === "ounces") {
    return amount * GRAMS_PER_OZ;
  }
  if (normalized === "lb" || normalized === "pound" || normalized === "pounds") {
    return amount * GRAMS_PER_LB;
  }
  return undefined;
}

/** Parse OFF-style serving text such as "30 g" or "1 oz (28 g)". */
export function parseGramsFromServingText(
  raw?: string | number | null,
): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parenGrams = trimmed.match(/\(([\d.]+)\s*g\)/i);
  if (parenGrams) {
    const grams = Number(parenGrams[1]);
    if (Number.isFinite(grams) && grams > 0) return grams;
  }

  const match = trimmed.match(/([\d.]+)\s*(g|gr|gram|grams|kg|ml|oz|lb)\b/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return gramsFromAmountAndUnit(amount, match[2]);
}

export function usdaServingGramsPerEach(food: {
  servingSize?: number;
  servingSizeUnit?: string;
}): number | undefined {
  const amount = food.servingSize;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = food.servingSizeUnit?.trim();
  if (!unit) return undefined;
  return gramsFromAmountAndUnit(amount, unit);
}

export function offServingGramsPerEach(product: {
  serving_size?: string | number;
  serving_quantity?: number;
}): number | undefined {
  const quantity = product.serving_quantity;
  if (quantity != null && Number.isFinite(quantity) && quantity > 0) {
    return quantity;
  }
  return parseGramsFromServingText(product.serving_size);
}
