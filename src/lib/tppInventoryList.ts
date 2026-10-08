// Reading the old system's "Inventory In-Stock" report (PL-SOURCE-DATASETS,
// AC-057 "equipment references"). Shared by the equipment page and the
// import seam (convex/tppEquipmentItems.ts). Built against the real report
// (.artifacts/tpp-migration-20260905/tpp_migration/reports/company_wide/
// Inventory_In-Stock.xlsx, 1,555 lines): title lines, then for each group a
// one-cell group name, the heading row, and one row per line; page footers
// ("Printed Date:") sit between pages.
//
// The old system kept everything that can go on a pack list in this one
// list: food, disposables and prep steps as well as kitchen tools. Only the
// groups of tools come in as equipment; every other group is left out with
// its reason, and so is a line with a vendor item number or a unit cost
// inside a tool group (bought food, such as rice in the chef pack).

/** Where every column of the report goes. */
export const TPP_INVENTORY_COLUMNS: ReadonlyArray<{
  column: string;
  goesTo: "item" | "details" | "not kept";
  note: string;
}> = [
  {
    column: "(group name above each heading row)",
    goesTo: "item",
    note: "decides if the line is equipment, and its category; also kept as Old-system group",
  },
  {
    column: "Inventory Item",
    goesTo: "item",
    note: "name; a |D12| style code in front is the bin, kept as Old-system bin; the item's tag is TPP-<name>",
  },
  {
    column: "Stock #",
    goesTo: "not kept",
    note: "a vendor item number marks bought food; those lines are left out",
  },
  { column: "Vendor", goesTo: "details", note: "Bought from" },
  {
    column: "In Stock*",
    goesTo: "item",
    note: "how many on hand (first file only; later counts are Capsule's)",
  },
  {
    column: "Unit Value / Total Value",
    goesTo: "not kept",
    note: "a unit cost marks bought food; those lines are left out (tools carry 0)",
  },
  { column: "Storage Location", goesTo: "item", note: "storage place" },
  {
    column: "Last Updated",
    goesTo: "details",
    note: "Last changed in the old system",
  },
];

/** Groups of tools, and the equipment category they come in as. */
const EQUIPMENT_GROUPS: Record<string, string> = {
  "(day of) chef pack based on need": "Cooking",
  "(day of) must pack boh items": "Cooking",
  "2. check items in trailer": "Site",
};

/** Groups that are not equipment, and why. */
const LEFT_OUT_GROUPS: Record<string, string> = {
  "cold food": "food",
  "dry food": "food",
  frozen: "food",
  bakery: "food",
  ingredients: "food",
  cambro: "food",
  "at venue": "food",
  "cold beverage container": "food",
  "dry goods": "supplies",
  "drop off servingware": "supplies",
  "prep list item": "prep",
  "finish at event": "prep",
};

const REASONS: Record<string, string> = {
  food: "Food, not equipment. Ingredients and dishes come from recipes and the menu import.",
  supplies:
    "Disposables and supplies used up at events, not equipment to keep and count.",
  prep: "Prep steps, not things. Prep lists come from recipes.",
  bought:
    "Bought food or supplies (it has a vendor item number or a unit cost), not equipment.",
  unknown: "Not a group of tools, so not brought in as equipment.",
};

export type TppEquipmentRow = {
  name: string;
  group: string;
  bin: string;
  vendor: string;
  inStock: number;
  storage: string;
  lastUpdated: string;
};

export type TppInventoryLeftOut = {
  group: string;
  count: number;
  reason: string;
};

const clean = (text: string | undefined) =>
  (text ?? "").replace(/\s+/g, " ").trim();
const key = (text: string) => clean(text).toLowerCase();

/** "|D12| Stir Sticks" -> bin D12, name "Stir Sticks". */
function splitBin(text: string): { bin: string; name: string } {
  const match = /^\|([^|]+)\|\s*(.*)$/.exec(text);
  return match
    ? { bin: clean(match[1]), name: clean(match[2]) }
    : { bin: "", name: text };
}

/** The item's tag in Capsule: the same old-system line always has the same tag. */
export const tppEquipmentTag = (name: string) =>
  `TPP-${key(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

export function tppEquipmentCategory(group: string): string {
  return EQUIPMENT_GROUPS[key(group)] ?? "Cooking";
}

/** True when the sheet is the old system's Inventory In-Stock report. */
export function isTppInventoryReport(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): boolean {
  return grid.some((cells) => key(cells[0] ?? "") === "inventory item");
}

/** Old-system spreadsheet day number or a written date -> "YYYY-MM-DD". */
function dayText(value: string): string {
  const text = clean(value);
  if (/^\d+(\.\d+)?$/.test(text)) {
    const date = new Date(Math.round((Number(text) - 25569) * 86400000));
    return date.toISOString().slice(0, 10);
  }
  return text.slice(0, 10);
}

const isNumber = (text: string | undefined) =>
  text != null && /^-?\d+(\.\d+)?$/.test(text);

/**
 * One line of the report, read by the order of its filled cells: the
 * spreadsheet places this report's cells out of their heading columns, but
 * their order holds - Inventory Item, [Stock #], [Vendor], In Stock, Unit
 * Value, [Storage Location], Total Value, Last Updated. Read from the end,
 * where every value but the place is a number. Null for anything else
 * (headings, page footers, group totals).
 */
function readLine(filled: ReadonlyArray<string>) {
  if (filled.length < 5 || /^printed date/i.test(filled[0]!)) return null;
  const rest = filled.slice(1);
  const lastUpdated = rest.pop();
  const total = rest.pop();
  const storage = isNumber(rest.at(-1)) ? "" : (rest.pop() ?? "");
  const unitValue = rest.pop();
  const inStock = rest.pop();
  if (![lastUpdated, total, unitValue, inStock].every(isNumber)) return null;
  // What is left sits between the name and the count: Stock # and Vendor.
  const stockNumber =
    rest.length === 2 || (rest.length === 1 && isNumber(rest[0]))
      ? rest.shift()!
      : "";
  return {
    name: filled[0]!,
    stockNumber,
    vendor: rest.join(" "),
    inStock: Number(inStock),
    unitValue: Number(unitValue),
    storage,
    lastUpdated: lastUpdated!,
  };
}

/** The tool lines of the report, and a count of left-out lines per group. */
export function readTppInventoryList(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): { rows: TppEquipmentRow[]; leftOut: TppInventoryLeftOut[] } {
  const rows: TppEquipmentRow[] = [];
  const leftOut = new Map<string, TppInventoryLeftOut>();
  const skip = (group: string, why: string) => {
    const id = `${group}\u0000${why}`;
    const entry = leftOut.get(id) ?? { group, count: 0, reason: REASONS[why]! };
    entry.count += 1;
    leftOut.set(id, entry);
  };

  let group = "";
  let previousSingle = "";
  for (const cells of grid) {
    const filled = cells.map(clean).filter((cell) => cell !== "");
    if (key(filled[0] ?? "") === "inventory item") {
      group = previousSingle;
      continue;
    }
    if (filled.length === 1) {
      previousSingle = filled[0]!;
      continue;
    }
    const line = readLine(filled);
    if (!group || !line) continue;

    const groupKey = key(group);
    if (!(groupKey in EQUIPMENT_GROUPS)) {
      skip(group, LEFT_OUT_GROUPS[groupKey] ?? "unknown");
      continue;
    }
    if (line.stockNumber || line.unitValue > 0) {
      skip(group, "bought");
      continue;
    }
    const { bin, name } = splitBin(line.name);
    rows.push({
      name,
      group,
      bin,
      vendor: line.vendor,
      inStock: Math.max(0, Math.round(line.inStock)),
      storage: line.storage,
      lastUpdated: dayText(line.lastUpdated),
    });
  }
  return { rows, leftOut: [...leftOut.values()] };
}
