/** Convert USDA / OFF label serving metadata into grams per catalog "each". */

const GRAMS_PER_OZ = 28.3495;
const GRAMS_PER_LB = 453.592;
const GRAMS_PER_KG = 1000;

function gramsFromAmountAndUnit(
  amount: number,
  unit: string,
): number | undefined {
  const normalized = unit.trim().toLowerCase();
  if (
    normalized === "g" ||
    normalized === "grm" ||
    normalized === "gram" ||
    normalized === "grams"
  ) {
    return amount;
  }
  if (normalized === "mg") return amount / 1000;
  if (normalized === "kg" || normalized === "kilogram") {
    return amount * GRAMS_PER_KG;
  }
  if (normalized === "ml") return amount;
  if (normalized === "oz" || normalized === "ounce" || normalized === "ounces") {
    return amount * GRAMS_PER_OZ;
  }
  if (normalized === "lb" || normalized === "pound" || normalized === "pounds") {
    return amount * GRAMS_PER_LB;
  }
  return undefined;
}

/** Leading count from household text such as "2 cookies" or "1 tortilla". */
export function parseHouseholdServingQuantity(text?: string | null): number {
  if (!text?.trim()) return 1;
  const leading = text.trim().match(/^([\d.,]+)/);
  if (!leading) return 1;
  const normalized = leading[1].replace(",", ".");
  const qty = Number(normalized);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function normalizeDecimalCommas(value: string): string {
  return value.replace(/(\d),(\d)/g, "$1.$2");
}

/** Parse OFF-style serving text such as "30 g" or "1 oz (28 g)". */
export function parseGramsFromServingText(
  raw?: string | number | null,
): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const trimmed = normalizeDecimalCommas(raw.trim());
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

function gramsPerCatalogEach(
  servingGrams: number | undefined,
  householdQuantity: number,
): number | undefined {
  if (servingGrams == null || servingGrams <= 0) return undefined;
  const qty =
    Number.isFinite(householdQuantity) && householdQuantity > 0
      ? householdQuantity
      : 1;
  return servingGrams / qty;
}

export function usdaServingGramsPerEach(food: {
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
}): number | undefined {
  const amount = food.servingSize;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = food.servingSizeUnit?.trim();
  if (!unit) return undefined;
  const servingGrams = gramsFromAmountAndUnit(amount, unit);
  return gramsPerCatalogEach(
    servingGrams,
    parseHouseholdServingQuantity(food.householdServingFullText),
  );
}

export function offServingGramsPerEach(product: {
  serving_size?: string | number;
  serving_quantity?: number;
}): number | undefined {
  const servingText =
    typeof product.serving_size === "string" ? product.serving_size : undefined;
  const householdQuantity = servingText
    ? parseHouseholdServingQuantity(servingText.split("(")[0])
    : 1;
  const servingGrams =
    product.serving_quantity != null &&
    Number.isFinite(product.serving_quantity) &&
    product.serving_quantity > 0
      ? product.serving_quantity
      : parseGramsFromServingText(product.serving_size);
  return gramsPerCatalogEach(servingGrams, householdQuantity);
}
