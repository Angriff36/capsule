/** Convert USDA / OFF label serving metadata into grams per catalog "each". */

export function usdaServingGramsPerEach(food: {
  servingSize?: number;
  servingSizeUnit?: string;
}): number | undefined {
  const amount = food.servingSize;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = food.servingSizeUnit?.trim().toLowerCase();
  if (!unit) return undefined;
  if (unit === "g" || unit === "grm" || unit === "gram" || unit === "grams") {
    return amount;
  }
  if (unit === "mg") return amount / 1000;
  if (unit === "kg" || unit === "kilogram") return amount * 1000;
  return undefined;
}

export function offServingGramsPerEach(product: {
  serving_size?: number;
  serving_quantity?: number;
}): number | undefined {
  const servingSize = product.serving_size;
  if (
    servingSize == null ||
    !Number.isFinite(servingSize) ||
    servingSize <= 0
  ) {
    return undefined;
  }
  const quantity = product.serving_quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
  return servingSize / quantity;
}
