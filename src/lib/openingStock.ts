/**
 * Opening stock rules (spec PR04-01, PR04-02; PL-OPENING-STOCK). Pure, so the
 * import, the review screen and the proofs share one answer.
 *
 * A count sheet row is sorted into food, equipment, disposables, in-house
 * items or instructions, and keeps its amount, unit, place, count time, source
 * and how sure the count is. Anything missing, unconvertible, clashing or
 * unchecked becomes an open issue on that row. Nothing here ever turns a gap
 * into zero, "each" or a guessed conversion.
 */
import {
  convertQuantity,
  resolveTppUnit,
  roundTo,
  type ItemUnitMappingLike,
  type UnitCode,
} from "../../convex/lib/culinaryModel/units";
import { UnitOfMeasureMapper } from "../features/kitchen/import/UnitOfMeasureMapper";

export type OpeningStockKind =
  | "ingredient"
  | "equipment"
  | "disposable"
  | "component"
  | "instruction"
  | "unsorted";

export type OpeningStockCountState =
  "counted" | "unverified" | "estimated" | "unknown";

export type OpeningStockIssue =
  | "unsorted_kind"
  | "unmatched_item"
  | "missing_quantity"
  | "missing_unit"
  | "unknown_unit"
  | "unit_incompatible"
  | "missing_location"
  | "unknown_location"
  | "missing_as_of"
  | "unverified_count"
  | "conflicting_snapshot";

/** Plain words for each issue, shown on the review list. */
export const OPENING_STOCK_ISSUE_TEXT: Record<OpeningStockIssue, string> = {
  unsorted_kind:
    "Say what this is: food, equipment, disposables, made in house, or an instruction.",
  unmatched_item: "No item in the catalog has this name. Pick the item.",
  missing_quantity: "The sheet gives no amount. Enter the counted amount.",
  missing_unit: "The sheet gives no unit. Enter the unit it was counted in.",
  unknown_unit: "This unit is not one Capsule knows. Enter the unit.",
  unit_incompatible:
    "This unit does not convert to the item's catalog unit. Recount in the catalog unit or record a pack size on the item.",
  missing_location: "The sheet gives no storage place. Pick where it is kept.",
  unknown_location: "No storage place has this name. Pick where it is kept.",
  missing_as_of: "The sheet gives no count date. Enter when it was counted.",
  unverified_count:
    "This count was not checked by hand. Confirm it was counted, or set it aside.",
  conflicting_snapshot:
    "Another row counts the same item in the same place on the same day with a different amount. Keep one and set the other aside.",
};

export const OPENING_STOCK_KIND_TEXT: Record<OpeningStockKind, string> = {
  ingredient: "Food",
  equipment: "Equipment",
  disposable: "Disposables",
  component: "Made in house",
  instruction: "Instruction",
  unsorted: "Not sorted",
};

/** One row as read from the sheet. Text stays as the sheet wrote it. */
export interface OpeningStockSourceRow {
  sourceRow: string;
  itemName: string;
  kindText: string;
  quantityText: string;
  unitText: string;
  locationText: string;
  asOfText: string;
  countStateText: string;
  note: string;
}

const text = (value: unknown): string =>
  value == null ? "" : String(value).trim();

const lookup = (row: Record<string, unknown>) => {
  const byKey = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    byKey.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), value);
  }
  return (...keys: string[]): string => {
    for (const key of keys) {
      const hit = text(byKey.get(key));
      if (hit) return hit;
    }
    return "";
  };
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Read one sheet row. Column names are matched loosely (Name / Item, Qty /
 * Quantity / On hand, UOM / Unit, Location / Storage, As of / Count date,
 * Counted / Verified / Status). The row key is the sheet's own id when it has
 * one, otherwise the row's content, so a re-import finds the same row again.
 */
export function readOpeningStockRow(
  raw: Record<string, unknown>,
): OpeningStockSourceRow | null {
  const get = lookup(raw);
  const itemName = get("name", "item", "itemname", "description", "product");
  if (!itemName) return null;
  const row: OpeningStockSourceRow = {
    sourceRow: "",
    itemName,
    kindText: get("type", "kind", "category", "itemtype", "class"),
    quantityText: get(
      "quantity",
      "qty",
      "count",
      "onhand",
      "quantityonhand",
      "amount",
    ),
    unitText: get("unit", "uom", "units", "unitofmeasure", "countunit"),
    locationText: get(
      "location",
      "storage",
      "storagelocation",
      "area",
      "place",
    ),
    asOfText: get("asof", "asofdate", "countdate", "countedat", "date"),
    countStateText: get(
      "countstatus",
      "counted",
      "verified",
      "status",
      "checked",
      "certainty",
    ),
    note: get("note", "notes", "comment", "comments"),
  };
  const id = get("id", "itemid", "rowid", "sku", "externalid");
  // An item id (SKU) repeats across locations and count dates on one sheet, so
  // the key carries both: each location's count is its own row.
  row.sourceRow = id
    ? [`id:${id}`, slug(row.locationText), slug(row.asOfText)].join("|")
    : [
        slug(row.itemName),
        slug(row.locationText),
        slug(row.asOfText),
        slug(row.quantityText),
        slug(row.unitText),
      ].join("|");
  return row;
}

const KIND_WORDS: Array<[OpeningStockKind, RegExp]> = [
  [
    "instruction",
    /\b(instruction|instructions|note|notes|step|direction|directions)\b/,
  ],
  [
    "disposable",
    /\b(disposable|disposables|paper|plastic|packaging|consumable|consumables|supplies)\b/,
  ],
  [
    "equipment",
    /\b(equipment|smallwares?|rental|rentals|reusable|tool|tools|chafers?|serveware|linen|linens)\b/,
  ],
  [
    "component",
    /\b(component|components|prep|sub-?recipe|in-?house|house[- ]made|made)\b/,
  ],
  [
    "ingredient",
    /\b(ingredient|ingredients|food|produce|dairy|protein|meat|seafood|dry goods|grocery|groceries|spice|spices|beverage|beverages)\b/,
  ],
];

/** Sort a row by what the sheet says it is. Blank or unknown stays unsorted. */
export function kindFromText(kindText: string): OpeningStockKind | null {
  const words = kindText.toLowerCase();
  if (!words) return null;
  for (const [kind, pattern] of KIND_WORDS) {
    if (pattern.test(words)) return kind;
  }
  return null;
}

const EXTRA_UNITS: Record<string, UnitCode> = {
  case: "case",
  cases: "case",
  cs: "case",
  package: "package",
  packages: "package",
  pkg: "package",
  pkgs: "package",
  pack: "package",
  tub: "tub",
  tubs: "tub",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  pc: "piece",
  pcs: "piece",
  litre: "liter",
  litres: "liter",
  lbs: "pound",
};

const unitMapper = new UnitOfMeasureMapper();

/** The unit the sheet names, or null when it is blank or unknown. Never "each" by default. */
export function unitFromText(unitText: string): UnitCode | null {
  const key = unitText.trim().toLowerCase().replace(/\.$/, "");
  if (!key) return null;
  if (EXTRA_UNITS[key]) return EXTRA_UNITS[key];
  const mapped = unitMapper.resolve(unitText);
  if (mapped) return mapped as UnitCode;
  const tpp = resolveTppUnit(unitText);
  return tpp.unit;
}

/** A plain number, or null. "", "n/a", "?" and words are not amounts. */
export function quantityFromText(quantityText: string): number | null {
  const cleaned = quantityText.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A count time from the sheet, or null. A bare date reads as that day at noon UTC. */
export function asOfFromText(asOfText: string): number | null {
  const value = asOfText.trim();
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00Z`
    : value;
  const at = Date.parse(dateOnly);
  return Number.isFinite(at) ? at : null;
}

export function countStateFromText(
  countStateText: string,
): OpeningStockCountState {
  const words = countStateText.toLowerCase();
  if (!words) return "unknown";
  if (/\b(unverified|unchecked|not counted|system|book|no|false)\b/.test(words))
    return "unverified";
  if (/\b(estimate|estimated|approx|approximate|guess)\b/.test(words))
    return "estimated";
  if (/\b(counted|verified|checked|physical|yes|true|confirmed)\b/.test(words))
    return "counted";
  return "unknown";
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: UnitCode;
}
export interface CatalogNamed {
  id: string;
  name: string;
}
export interface OpeningStockCatalog {
  ingredients: CatalogIngredient[];
  components: CatalogNamed[];
  locations: CatalogNamed[];
  mappings: ItemUnitMappingLike[];
}

const nameKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const findByName = <T extends CatalogNamed>(list: T[], name: string) => {
  const key = nameKey(name);
  if (!key) return null;
  const hits = list.filter((item) => nameKey(item.name) === key);
  return hits.length === 1 ? hits[0] : null;
};

/** The record as the review works with it: what the sheet says plus what a person fixed. */
export interface OpeningStockDraft {
  sourceRow: string;
  itemName: string;
  kind: OpeningStockKind;
  ingredientId: string | null;
  componentId: string | null;
  locationId: string | null;
  locationName: string;
  quantity: number | null;
  sourceUnit: string;
  unit: UnitCode | null;
  asOfAt: number | null;
  countState: OpeningStockCountState;
  note: string;
}

/** First reading of a sheet row against the catalog. */
export function draftFromRow(
  row: OpeningStockSourceRow,
  catalog: OpeningStockCatalog,
): OpeningStockDraft {
  const ingredient = findByName(catalog.ingredients, row.itemName);
  const component = findByName(catalog.components, row.itemName);
  const location = findByName(catalog.locations, row.locationText);
  const quantity = quantityFromText(row.quantityText);
  let kind = kindFromText(row.kindText);
  if (!kind) {
    if (ingredient && !component) kind = "ingredient";
    else if (component && !ingredient) kind = "component";
    else if (quantity == null && row.itemName.trim().split(/\s+/).length >= 6)
      kind = "instruction";
    else kind = "unsorted";
  }
  return {
    sourceRow: row.sourceRow,
    itemName: row.itemName,
    kind,
    ingredientId: kind === "ingredient" ? (ingredient?.id ?? null) : null,
    componentId: kind === "component" ? (component?.id ?? null) : null,
    locationId: location?.id ?? null,
    locationName: location?.name ?? row.locationText,
    quantity,
    sourceUnit: row.unitText,
    unit: unitFromText(row.unitText),
    asOfAt: asOfFromText(row.asOfText),
    countState: countStateFromText(row.countStateText),
    note: row.note,
  };
}

export interface OpeningStockEvaluation {
  issues: OpeningStockIssue[];
  /** Amount in the ingredient's catalog unit, set only by an exact conversion. */
  catalogQuantity: number | null;
}

/** The issues on one record, before comparing it with other rows. */
export function evaluateOpeningStock(
  draft: OpeningStockDraft,
  catalog: OpeningStockCatalog,
): OpeningStockEvaluation {
  const issues: OpeningStockIssue[] = [];
  if (draft.kind === "instruction") return { issues, catalogQuantity: null };
  if (draft.kind === "unsorted") issues.push("unsorted_kind");
  const ingredient =
    draft.kind === "ingredient" && draft.ingredientId
      ? catalog.ingredients.find((item) => item.id === draft.ingredientId)
      : undefined;
  if (
    (draft.kind === "ingredient" && !ingredient) ||
    (draft.kind === "component" && !draft.componentId)
  ) {
    issues.push("unmatched_item");
  }
  if (draft.quantity == null) issues.push("missing_quantity");
  if (!draft.unit) {
    issues.push(draft.sourceUnit.trim() ? "unknown_unit" : "missing_unit");
  }
  if (!draft.locationId) {
    issues.push(
      draft.locationName.trim() ? "unknown_location" : "missing_location",
    );
  }
  if (draft.asOfAt == null) issues.push("missing_as_of");
  if (draft.countState !== "counted") issues.push("unverified_count");

  let catalogQuantity: number | null = null;
  if (ingredient && draft.unit && draft.quantity != null) {
    const converted = convertQuantity(
      draft.quantity,
      draft.unit,
      ingredient.unit,
      catalog.mappings,
      { itemKind: "ingredient", itemId: ingredient.id },
    );
    if (converted.status === "resolved") {
      catalogQuantity = roundTo(converted.quantity);
    } else {
      issues.push("unit_incompatible");
    }
  }
  return { issues, catalogQuantity };
}

/** Same item in the same place: the ingredient/component when known, else the names. */
export function snapshotGroupKey(draft: OpeningStockDraft): string | null {
  if (draft.kind === "instruction") return null;
  const item =
    draft.ingredientId ??
    draft.componentId ??
    `name:${nameKey(draft.itemName)}`;
  const place = draft.locationId ?? `name:${nameKey(draft.locationName)}`;
  return `${draft.kind}|${item}|${place}`;
}

const dayOf = (at: number | null) =>
  at == null ? "no-date" : new Date(at).toISOString().slice(0, 10);

/** Comparable amount: catalog amount when known, else the sheet amount and unit. */
const amountKey = (
  draft: OpeningStockDraft,
  catalogQuantity: number | null,
): string =>
  catalogQuantity != null
    ? `c:${catalogQuantity}`
    : `s:${draft.quantity ?? "none"}:${draft.unit ?? draft.sourceUnit.toLowerCase()}`;

export interface OpenRecordForClash {
  key: string;
  draft: OpeningStockDraft;
  catalogQuantity: number | null;
}

/**
 * Keys of open records that clash: same item, same place, same count day,
 * different amounts. Different days are not a clash - they are two
 * snapshots, and the person picks which one opens the stock.
 */
export function clashingKeys(records: OpenRecordForClash[]): Set<string> {
  const groups = new Map<string, OpenRecordForClash[]>();
  for (const record of records) {
    const group = snapshotGroupKey(record.draft);
    if (!group) continue;
    const key = `${group}|${dayOf(record.draft.asOfAt)}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const clashing = new Set<string>();
  for (const members of groups.values()) {
    const amounts = new Set(
      members.map((m) => amountKey(m.draft, m.catalogQuantity)),
    );
    if (amounts.size > 1) for (const m of members) clashing.add(m.key);
  }
  return clashing;
}

/** Final issue list: the record's own issues plus a clash when there is one. */
export function withClash(
  issues: OpeningStockIssue[],
  clashing: boolean,
): OpeningStockIssue[] {
  return clashing ? [...issues, "conflicting_snapshot"] : issues;
}

export function issuesJson(issues: OpeningStockIssue[]): string {
  return JSON.stringify(issues);
}

export function parseIssues(
  json: string | null | undefined,
): OpeningStockIssue[] {
  try {
    const value = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(value) ? (value as OpeningStockIssue[]) : [];
  } catch {
    return [];
  }
}
