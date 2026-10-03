// PL-SOURCE-DATASETS / PL-SOURCE-DELTA: a pack list imported again from the
// old system is compared line by line. Each line the old system lists is one
// compared field ("line:<description>"), its value the amount and unit
// ("6 each"). Only plain lines count on the Capsule side: lines a kit, a
// template, a pack rule or a dish put on the list are Capsule's own.
//
// A new line or a changed amount on a line nobody changed in Capsule is
// written; a line the old system dropped, a changed unit, or a line a person
// changed waits on the review list (a packer may already be counting it).
import type { FieldValue } from "./culinaryModel/importMapping";
import type { SourceFieldMap } from "./importSourceFields";

type Row = Record<string, unknown>;
type Values = Record<string, FieldValue>;

export const PACK_LINE_PREFIX = "line:";

const lineField = (description: string) =>
  `${PACK_LINE_PREFIX}${description.trim()}`;

/** "6 each" -> { quantity: 6, unit: "each" }; null for anything else. */
export function readPackLineValue(
  value: FieldValue,
): { quantity: number; unit: string } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?) (\S+)$/.exec(value);
  if (!match) return null;
  const quantity = Number(match[1]);
  return quantity > 0 ? { quantity, unit: match[2]! } : null;
}

/** Same description listed twice adds up; two units on one line read "2 each + 1 case". */
function linesOf(
  rows: Array<{ description: unknown; quantity: unknown; unit: unknown }>,
): Values {
  const totals = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (typeof row.description !== "string" || !row.description.trim()) {
      continue;
    }
    const field = lineField(row.description);
    const unit = typeof row.unit === "string" && row.unit ? row.unit : "each";
    const quantity = Number(row.quantity) || 0;
    const units = totals.get(field) ?? new Map<string, number>();
    units.set(unit, (units.get(unit) ?? 0) + quantity);
    totals.set(field, units);
  }
  const values: Values = {};
  for (const [field, units] of totals) {
    values[field] = [...units.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unit, quantity]) => `${Math.round(quantity * 10_000) / 10_000} ${unit}`)
      .join(" + ");
  }
  return values;
}

/** A line Capsule added on its own (kit, template, pack rule, dish, batch). */
export function isCapsuleOwnLine(item: Row): boolean {
  return [
    "dishId",
    "eventDishId",
    "dishContainerId",
    "productionBatchId",
    "serviceStyleKitItemId",
    "generationKey",
    "packListTemplateId",
    "retiredAt",
  ].some((field) => item[field] != null);
}

export const PACK_LIST_FIELDS: SourceFieldMap = {
  fields: [],
  writable: [],
  labels: {},
  fromSource: (row) =>
    linesOf(
      (Array.isArray(row.items) ? (row.items as Row[]) : []).map((item) => ({
        description: item.description,
        quantity: item.requiredQuantity,
        unit: item.unit,
      })),
    ),
  fromCapsule: (doc) =>
    linesOf(
      (Array.isArray(doc.lines) ? (doc.lines as Row[]) : [])
        .filter((item) => !isCapsuleOwnLine(item))
        .map((item) => ({
          description: item.description,
          quantity: item.requiredQuantity,
          unit: item.unit,
        })),
    ),
  // Lines the old system lists now or listed last time; a line only a person
  // added in Capsule is never compared.
  fieldsFor: (applied, source) =>
    [...new Set([...Object.keys(applied ?? {}), ...Object.keys(source)])]
      .filter((field) => field.startsWith(PACK_LINE_PREFIX))
      .sort(),
  canWrite: (field, value) =>
    field.startsWith(PACK_LINE_PREFIX) && readPackLineValue(value) != null,
  labelFor: (field) =>
    field.startsWith(PACK_LINE_PREFIX)
      ? `Pack line "${field.slice(PACK_LINE_PREFIX.length)}"`
      : field,
};
