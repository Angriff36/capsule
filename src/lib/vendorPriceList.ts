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
  priceDateText: string;
  /** Noon UTC on the row's price date, or null when there is none. */
  priceDate: number | null;
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

/**
 * "2025-03-14", "3/14/2025" or "3/14/25" -> noon UTC that day (the same
 * calendar day in every US time zone); anything else -> null.
 */
export function priceDateFromText(text: string): number | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [
          us[3]!.length === 2 ? 2000 + Number(us[3]) : Number(us[3]),
          Number(us[1]),
          Number(us[2]),
        ]
      : [NaN, NaN, NaN];
  const at = Date.UTC(year, month - 1, day, 12);
  const back = new Date(at);
  return Number.isFinite(at) &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day
    ? at
    : null;
}

/** One sheet row → the fields a vendor item needs. Headers are matched loosely. */
export function readVendorPriceRow(
  row: Record<string, unknown>,
): VendorPriceRow {
  const packUnitText = pick(row, "Pack unit", "Unit", "UOM", "Pack UOM");
  const priceText = pick(row, "Pack price", "Price", "Case price", "Cost");
  const itemName = pick(row, "Item name", "Item", "Description", "Product");
  const priceDateText = pick(
    row,
    "Price date",
    "Date",
    "Effective date",
    "As of",
    "Price as of",
  );
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
    priceDateText,
    priceDate: priceDateText ? priceDateFromText(priceDateText) : null,
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
  if (row.priceDateText && row.priceDate == null)
    return `"${row.priceDateText}" is not a date. Write it like 2025-03-14 or 3/14/2025.`;
  if (row.priceDate != null && row.packPrice == null)
    return "A price date needs a pack price on the same row.";
  return null;
}

/** Names compare without case or extra spaces. */
export const nameKey = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");
