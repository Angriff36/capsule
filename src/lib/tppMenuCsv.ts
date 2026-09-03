// TPP menu CSV → importOneShot row mapper.
//
// Accepts the real TPP "Menu Items Export" headers (Name, Description,
// Category, Portion Size, Portion Unit, Portion Price, Tags, ...) and the
// snake_case work/dishes.csv shape (name, portion_size_description,
// dietary_tags, allergens). Mirrors the converter rules used to build
// work/tpp-menus-*.json so both paths produce the same ids.

export interface TppMenuFeedRow {
  menu_item_id: string;
  name: string;
  description?: string;
  category?: string;
  service_style?: string;
  portion_size_description?: string;
  dietary_tags?: string;
  allergens?: string;
  price_per_person?: number;
}

// RFC4180-lite: quoted fields, escaped quotes, newlines inside quotes, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || s;

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

const KEEP_TEXT_TAGS = /[a-z]/i;

/**
 * Map a parsed CSV (header row + data rows) to the TppMenuRecord feed the
 * menus commit path parses. Identity rule: unique dish name → slug(name)
 * (matches previously imported dishes, so re-import skips cleanly); any
 * collision (same name across prep-path categories, or two names slugging
 * alike) → category-qualified slug with a stable _n suffix so each TPP row
 * keeps its own dish + link.
 */
export function tppMenuCsvToRows(text: string): {
  rows: TppMenuFeedRow[];
  skipped: number;
} {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0 };
  const headers = table[0].map(normalizeHeader);
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const cName = col("name");
  if (cName < 0) {
    throw new Error('CSV is missing a "Name" column.');
  }
  const cDesc = col("description");
  const cCat = col("category");
  const cSize = col("portion_size", "portion_size_description");
  const cUnit = col("portion_unit");
  const cStyle = col("service_style", "servicestyle");
  const cPrice = col("portion_price", "price_per_person");
  const cTags = col("tags", "dietary_tags");
  const cAllergens = col("allergens");

  // Pass 1: raw records + name counts.
  const raw: Array<Omit<TppMenuFeedRow, "menu_item_id">> = [];
  const nameCount = new Map<string, number>();
  for (const cells of table.slice(1)) {
    const name = (cells[cName] ?? "").trim();
    if (!name) {
      continue;
    }
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    const category = cCat >= 0 ? (cells[cCat] ?? "").trim() : "";
    const size = cSize >= 0 ? (cells[cSize] ?? "").trim() : "";
    const unit = cUnit >= 0 ? (cells[cUnit] ?? "").trim() : "";
    const priceRaw =
      cPrice >= 0
        ? parseFloat((cells[cPrice] ?? "").replace(/[$,\s]/g, ""))
        : NaN;
    const tags = (cTags >= 0 ? (cells[cTags] ?? "") : "")
      .split(/[\n;,]/)
      .map((t) => t.trim())
      .filter((t) => t && KEEP_TEXT_TAGS.test(t) && !/^\d+$/.test(t))
      .map((t) => t.toLowerCase());
    raw.push({
      name,
      description: cDesc >= 0 ? (cells[cDesc] ?? "").trim() : "",
      category: category || undefined,
      service_style:
        cStyle >= 0 ? (cells[cStyle] ?? "").trim() || undefined : undefined,
      portion_size_description:
        [size, unit].filter(Boolean).join(" ") || undefined,
      dietary_tags: tags.length ? [...new Set(tags)].join("; ") : undefined,
      allergens: cAllergens >= 0 ? (cells[cAllergens] ?? "").trim() : undefined,
      price_per_person: Number.isFinite(priceRaw) ? priceRaw : undefined,
    });
  }

  // Pass 2: stable external ids.
  const seen = new Map<string, number>();
  const rows = raw.map((rec) => {
    let base = slug(rec.name);
    if ((nameCount.get(rec.name) ?? 0) > 1) {
      base = slug(`${rec.name} ${rec.category ?? "uncategorized"}`);
    }
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { menu_item_id: n > 0 ? `${base}_${n}` : base, ...rec };
  });
  return { rows, skipped: table.length - 1 - rows.length };
}
