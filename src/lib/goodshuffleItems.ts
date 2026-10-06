// Reading the Goodshuffle Pro inventory export (PL-REPLACEMENT-PROOF,
// Goodshuffle: "no way in yet for Goodshuffle items"). Shared by the
// equipment page and the import seam (convex/goodshuffleItems.ts), so both
// read a row the same way. Built against the real export
// (work/inventory-export-1-05-14-2026@02_05PM-PDT.xlsx and its short
// @02_07PM form): two title lines, then the header row, then one row per
// Product ID.

/**
 * Where every column of the export goes. "item" = the equipment record,
 * "details" = the item's saved details (shown on its details panel),
 * "not kept" = left out, with the reason.
 */
export const GOODSHUFFLE_COLUMNS: ReadonlyArray<{
  column: string;
  goesTo: "item" | "details" | "not kept";
  note: string;
}> = [
  {
    column: "Product ID",
    goesTo: "item",
    note: "the item's tag, GS-<id>; a later file finds the same item by it",
  },
  { column: "Title", goesTo: "item", note: "name" },
  {
    column: "Type",
    goesTo: "not kept",
    note: "only Product rows are items; Service and Delivery Logistics rows are charges, not equipment",
  },
  { column: "Primary Category", goesTo: "item", note: "category" },
  { column: "Sub Category", goesTo: "details", note: "Sub category" },
  {
    column: "Contract Description / Web Description",
    goesTo: "item",
    note: "description (contract text first)",
  },
  { column: "Internal Notes", goesTo: "details", note: "Goodshuffle note" },
  { column: "Tags", goesTo: "details", note: "Tags" },
  {
    column: "Qty Posted",
    goesTo: "item",
    note: "how many on hand (first file only; later counts are Capsule's)",
  },
  { column: "Set Aside", goesTo: "details", note: "Set aside in Goodshuffle" },
  {
    column: "In Stock / Max Needed / Qty Booked / Frequency Booked",
    goesTo: "not kept",
    note: "worked out from Goodshuffle bookings; Capsule works these out from its own holds",
  },
  {
    column: "Last Contract Date",
    goesTo: "details",
    note: "Last booked in Goodshuffle",
  },
  {
    column: "Item Images",
    goesTo: "item",
    note: "the first picture becomes the main picture",
  },
  {
    column: "One Day Price / Flat Fee Price",
    goesTo: "item",
    note: "client price (one-day price first)",
  },
  {
    column: "Three Day Price / Weekly Price / Monthly Price",
    goesTo: "details",
    note: "kept as written",
  },
  {
    column: "Purchase Price",
    goesTo: "item",
    note: "purchase value (empty in the real export)",
  },
  {
    column: "SKU (Attr::SKU, Attr::Sku)",
    goesTo: "details",
    note: "Goodshuffle SKU",
  },
  {
    column: "Location (Attr::Location)",
    goesTo: "item",
    note: "storage place (TBD = not set)",
  },
  {
    column: "Color, Material, Shape, Size, Style, Power Type, Type, Christmas",
    goesTo: "details",
    note: "kept by name",
  },
  {
    column: "Vendor / Supplier, Vendor Sku",
    goesTo: "details",
    note: "Bought from, Vendor item number",
  },
  {
    column:
      "Date Created / Created By / Last Updated / Last Updated By / Last Imported",
    goesTo: "not kept",
    note: "Goodshuffle's own record keeping",
  },
  {
    column: "Gross Revenue",
    goesTo: "not kept",
    note: "0 on every row of the real export; rental money comes from Capsule events",
  },
  {
    column:
      "Mileage Rate / Percent of Line Item Group / Percent of Order / Minimum Fee / (Hourly) Min. Rental Period / (Hourly) Base Rate / (Hourly) Additional Hour Rate",
    goesTo: "not kept",
    note: "pricing rules of charge rows (damage waiver, delivery), not item facts",
  },
  {
    column: "...Visible on ECommerce, ::ClientVisible, ::Pullsheet",
    goesTo: "not kept",
    note: "Goodshuffle web shop and pull sheet display switches",
  },
];

export type GoodshuffleItemRow = {
  productId: string;
  title: string;
  type: string;
  /** Product rows are items; service and delivery rows are charges. */
  isItem: boolean;
  category: string;
  description: string;
  quantityText: string;
  quantity: number | null;
  customerPrice: number | null;
  purchaseValue: number | null;
  homeLocation: string;
  imageUrl: string;
  /** Saved on the item as its details, by name. */
  details: Record<string, string>;
};

const plain = (name: string) => name.toLowerCase().replace(/[\s_#.]/g, "");

/** An item attribute: "Attr::Color" in the full export, "Color" in the short one. */
const attr = (...names: string[]) =>
  names.flatMap((name) => [`Attr::${name}`, name]);

const pick = (row: Record<string, unknown>, ...names: string[]): string => {
  const wanted = names.map(plain);
  for (const want of wanted)
    for (const [key, value] of Object.entries(row))
      if (plain(key) === want && value != null && String(value).trim())
        return String(value).trim();
  return "";
};

/** "275.0" or "$1,234.50" -> a number; blank, words or a negative -> null. */
function amount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const money = (text: string) => {
  const value = amount(text);
  return value == null ? "" : `$${value.toFixed(2)}`;
};

/** The item's tag in Capsule: the same Goodshuffle item always has the same tag. */
export const goodshuffleTag = (productId: string) => `GS-${productId.trim()}`;

/** One sheet row -> the facts an equipment item needs. Headers are matched loosely. */
export function readGoodshuffleRow(
  row: Record<string, unknown>,
): GoodshuffleItemRow {
  const type = pick(row, "Type");
  const quantityText = pick(row, "Qty Posted", "Quantity", "Qty");
  const quantity = amount(quantityText);
  const location = pick(row, ...attr("Location"));
  const setAside = amount(pick(row, "Set Aside"));
  const details: Record<string, string> = {
    "Sub category": pick(row, "Sub Category"),
    "Goodshuffle SKU": pick(row, ...attr("SKU")),
    Tags: pick(row, "Tags"),
    Color: pick(row, ...attr("Color")),
    Material: pick(row, ...attr("Material")),
    Shape: pick(row, ...attr("Shape")),
    Size: pick(row, ...attr("Size")),
    Style: pick(row, ...attr("Style")),
    "Power type": pick(row, ...attr("Power Type")),
    // Only the attribute: a bare "Type" column is the row type.
    Kind: pick(row, "Attr::Type"),
    Christmas: pick(row, ...attr("Christmas")),
    "Bought from": pick(row, ...attr("Vendor", "Supplier")),
    "Vendor item number": pick(row, ...attr("Vendor Sku")),
    "Set aside in Goodshuffle": setAside ? String(setAside) : "",
    "Last booked in Goodshuffle": pick(row, "Last Contract Date"),
    "Three day price": money(pick(row, "Three Day Price")),
    "Weekly price": money(pick(row, "Weekly Price")),
    "Monthly price": money(pick(row, "Monthly Price")),
    "Goodshuffle note": pick(row, "Internal Notes"),
  };
  return {
    productId: pick(row, "Product ID"),
    title: pick(row, "Title", "Name"),
    type,
    isItem: type === "" || type.toLowerCase() === "product",
    category: pick(row, "Primary Category", "Category"),
    description: pick(row, "Contract Description", "Web Description"),
    quantityText,
    quantity,
    customerPrice:
      amount(pick(row, "One Day Price")) ?? amount(pick(row, "Flat Fee Price")),
    purchaseValue: amount(pick(row, "Purchase Price")),
    homeLocation: /^tbd$/i.test(location) ? "" : location,
    imageUrl:
      pick(row, "Item Images")
        .split(/[,\s]+/)
        .find((url) => url.startsWith("https://")) ?? "",
    details: Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== ""),
    ),
  };
}

/** Why a row can't become an item, in plain words, or null when it can. */
export function goodshuffleRowProblem(row: GoodshuffleItemRow): string | null {
  if (!row.productId) return "No Product ID.";
  if (!row.title) return "No title.";
  if (!row.isItem)
    return `"${row.title}" is a ${row.type.toLowerCase()} charge, not an item. Add it as a price line on proposals instead.`;
  if (row.quantity == null)
    return row.quantityText
      ? `"${row.quantityText}" is not a count.`
      : "No Qty Posted.";
  if (!Number.isInteger(row.quantity))
    return `"${row.quantityText}" is not a whole count.`;
  return null;
}

/**
 * A sheet's rows as objects keyed by its headers. The export starts with
 * title lines; the header row is the first one with a Product ID column.
 */
export function goodshuffleSheetRows(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): { rows: Record<string, string>[]; firstRowNumber: number } {
  const headerIndex = grid.findIndex((cells) =>
    cells.some((cell) => plain(cell) === "productid"),
  );
  if (headerIndex < 0) return { rows: [], firstRowNumber: 1 };
  const header = grid[headerIndex]!.map((name) => name.trim());
  const rows: Record<string, string>[] = [];
  for (const cells of grid.slice(headerIndex + 1)) {
    if (!cells.some((cell) => cell.trim() !== "")) break;
    rows.push(
      Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])),
    );
  }
  return { rows, firstRowNumber: headerIndex + 2 };
}
