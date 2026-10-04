// Reading one row of a vendor price list (Galley replacement: vendors and
// their prices had no way in). Shared by the purchasing screen and the
// import seam (convex/vendorPriceList.ts), so both read a row the same way.
import { quantityFromText, unitFromText } from "./openingStock";
import type { UnitCode } from "../../convex/lib/culinaryModel/units";

export type VendorPriceRow = {
  vendorName: string;
  itemCode: string;
  itemName: string;
  ingredientName: string;
  packQuantity: number | null;
  packUnitText: string;
  packUnit: UnitCode | null;
  packPrice: number | null;
  priceText: string;
};

const pick = (row: Record<string, unknown>, ...names: string[]): string => {
  const wanted = names.map((name) =>
    name.toLowerCase().replace(/[\s_#.]/g, ""),
  );
  for (const [key, value] of Object.entries(row)) {
    const plain = key.toLowerCase().replace(/[\s_#.]/g, "");
    if (wanted.includes(plain) && value != null) return String(value).trim();
  }
  return "";
};

/** "$1,234.50" or "12" → a number; blank, words or a negative → null. */
export function priceFromText(priceText: string): number | null {
  return quantityFromText(priceText.replace(/^\$/, "").replace(/\$/g, ""));
}

/** One sheet row → the fields a vendor item needs. Headers are matched loosely. */
export function readVendorPriceRow(
  row: Record<string, unknown>,
): VendorPriceRow {
  const packUnitText = pick(row, "Pack unit", "Unit", "UOM", "Pack UOM");
  const priceText = pick(row, "Pack price", "Price", "Case price", "Cost");
  const itemName = pick(row, "Item name", "Item", "Description", "Product");
  return {
    vendorName: pick(row, "Vendor", "Vendor name", "Supplier"),
    itemCode: pick(row, "Item number", "Item code", "Item no", "SKU", "Code"),
    itemName,
    ingredientName: pick(row, "Ingredient", "Ingredient name") || itemName,
    packQuantity: quantityFromText(
      pick(row, "Pack amount", "Pack size", "Pack quantity", "Pack", "Size"),
    ),
    packUnitText,
    packUnit: unitFromText(packUnitText),
    packPrice: priceFromText(priceText),
    priceText,
  };
}

/** Why a row can't become a vendor item, in plain words, or null when it can. */
export function vendorPriceRowProblem(row: VendorPriceRow): string | null {
  if (!row.vendorName) return "No vendor name.";
  if (!row.itemName) return "No item name.";
  if (row.packQuantity == null || row.packQuantity <= 0)
    return "The pack amount is missing or not a number above zero.";
  if (!row.packUnit)
    return row.packUnitText
      ? `"${row.packUnitText}" is not a unit we know.`
      : "No pack unit.";
  if (row.priceText && row.packPrice == null)
    return `"${row.priceText}" is not a price.`;
  return null;
}

/** Names compare without case or extra spaces. */
export const nameKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");
