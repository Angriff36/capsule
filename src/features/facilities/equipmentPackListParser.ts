/**
 * Turns a pasted pack list into equipment catalog rows (#368 item 16 — the
 * catalog had one seeded "QA Chafing Dish" while the real pack lists carried
 * dozens of items across Equipment / Rentals / Always Pack sections). Accepts
 * the shapes people actually paste:
 *
 *   Equipment:            ← a line ending in ":" sets the category below it
 *   2 x 10x10 Tent
 *   Big John Grill
 *   Propane tanks (4)
 *   Tarps x 6
 *   Linens | 30 | Linens  ← tab / pipe separated: name, qty, category
 *
 * Section names containing "rental" mark those rows as rented.
 */
export type ParsedEquipmentLine = {
  name: string;
  quantity: number;
  category: string;
  ownership: "owned" | "rented";
};

const DEFAULT_CATEGORY = "Equipment";

function ownershipFor(category: string): "owned" | "rented" {
  return /rental|rented|hire/i.test(category) ? "rented" : "owned";
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[-*•·\u2022]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDelimited(
  parts: string[],
  category: string,
): ParsedEquipmentLine | null {
  const name = cleanName(parts[0] ?? "");
  if (!name) return null;
  const quantity = Number(parts[1]);
  const lineCategory = (parts[2] ?? "").trim() || category;
  return {
    name,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    category: lineCategory,
    ownership: ownershipFor(lineCategory),
  };
}

function parseFreeform(
  line: string,
  category: string,
): ParsedEquipmentLine | null {
  let text = cleanName(line);
  if (!text) return null;
  let quantity = 1;
  // "2 x 10x10 Tent" / "4 Tarps" → leading count; "10x10 Tent" and
  // "5 gal water jug" stay whole (a size, not a count).
  const leading =
    /^(\d+)\s*[x×]\s+(.+)$/i.exec(text) ?? /^(\d+)\s+(.+)$/i.exec(text);
  const unitStart =
    /^(ft|in|inch|inches|foot|feet|gal|gallon|lb|lbs|oz|qt|pt|l|liter|litre|cm|mm|m)\b/i;
  const trailing = /^(.+?)\s*(?:[x×]\s*(\d+)|\((\d+)\))\s*$/i.exec(text);
  if (leading && !unitStart.test(leading[2] ?? "")) {
    quantity = Number(leading[1]);
    text = cleanName(leading[2] ?? "");
  } else if (trailing) {
    quantity = Number(trailing[2] ?? trailing[3]);
    text = cleanName(trailing[1] ?? "");
  }
  if (!text) return null;
  return {
    name: text,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    category,
    ownership: ownershipFor(category),
  };
}

export function parseEquipmentPackList(text: string): ParsedEquipmentLine[] {
  const rows: ParsedEquipmentLine[] = [];
  let category = DEFAULT_CATEGORY;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = /^([A-Za-z][A-Za-z0-9 /&'-]{1,40}):\s*$/.exec(line);
    if (header) {
      category = header[1]!.trim();
      continue;
    }
    const parts = line.includes("\t")
      ? line.split("\t")
      : line.includes("|")
        ? line.split("|")
        : null;
    const parsed = parts
      ? parseDelimited(parts, category)
      : parseFreeform(line, category);
    if (parsed) rows.push(parsed);
  }
  return dedupeByName(rows);
}

/** Same name twice in one paste → one row with the quantities added. */
function dedupeByName(rows: ParsedEquipmentLine[]): ParsedEquipmentLine[] {
  const byName = new Map<string, ParsedEquipmentLine>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.quantity += row.quantity;
    else byName.set(key, { ...row });
  }
  return [...byName.values()];
}

/** "Big John Grill" → "BIG-JOHN-GRILL", unique against the tags already used. */
export function assetTagFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "ITEM";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}
