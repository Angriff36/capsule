/**
 * Equipment fields: the company's own facts per equipment category ("Ovens"
 * ask for "Fuel" and "Burners"), and each item's answers. Pure.
 *
 * The field names are saved on Organization.equipmentFieldsJson as
 * {"Ovens": ["Fuel", "Burners"]}; the answers on Equipment.customFieldsJson
 * as {"Fuel": "propane", "Burners": "4"}.
 */

export type EquipmentFieldSets = Record<string, string[]>;

const categoryKey = (category: string) => category.trim().toLowerCase();

export function parseEquipmentFieldSets(
  raw: string | null | undefined,
): EquipmentFieldSets {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed))
    return {};
  const sets: EquipmentFieldSets = {};
  for (const [category, fields] of Object.entries(parsed)) {
    if (!category.trim() || !Array.isArray(fields)) continue;
    const names = [
      ...new Set(
        fields
          .filter((field): field is string => typeof field === "string")
          .map((field) => field.trim())
          .filter(Boolean),
      ),
    ];
    if (names.length > 0) sets[category.trim()] = names;
  }
  return sets;
}

/** The fields an item's category asks for; the category is matched without case. */
export function fieldsForCategory(
  sets: EquipmentFieldSets,
  category: string | null | undefined,
): string[] {
  const wanted = categoryKey(category ?? "");
  if (!wanted) return [];
  const found = Object.entries(sets).find(
    ([name]) => categoryKey(name) === wanted,
  );
  return found ? found[1] : [];
}

/** "Ovens: Fuel, Burners" - one category on each line. */
export function fieldSetsFromText(text: string): EquipmentFieldSets {
  const sets: EquipmentFieldSets = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const category = line.slice(0, at).trim();
    const fields = line
      .slice(at + 1)
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
    if (category && fields.length > 0)
      sets[category] = [...new Set([...(sets[category] ?? []), ...fields])];
  }
  return sets;
}

export function fieldSetsToText(sets: EquipmentFieldSets): string {
  return Object.entries(sets)
    .map(([category, fields]) => `${category}: ${fields.join(", ")}`)
    .join("\n");
}

export function fieldSetsJson(sets: EquipmentFieldSets): string | undefined {
  return Object.keys(sets).length > 0 ? JSON.stringify(sets) : undefined;
}

export function parseFieldValues(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed))
    return {};
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed))
    if (typeof value === "string" && value.trim()) values[name] = value.trim();
  return values;
}

/**
 * The answers to save: the fields asked for now, plus any older answer whose
 * field was since removed from the category (kept, never dropped silently).
 */
export function fieldValuesJson(
  previous: Record<string, string>,
  answers: Record<string, string>,
): string | undefined {
  const values: Record<string, string> = { ...previous };
  for (const [name, value] of Object.entries(answers)) {
    if (value.trim()) values[name] = value.trim();
    else delete values[name];
  }
  return Object.keys(values).length > 0 ? JSON.stringify(values) : undefined;
}
