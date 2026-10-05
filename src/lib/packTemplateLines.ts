/**
 * Pack list template lines (spec §11.2, AC-132/AC-340): read a template's
 * stored lines, give each a stable key, and preview what applying it to a
 * pack list will do before anything is written.
 *
 * Pure. Used by the pack list page (preview) and by
 * convex/lib/safeMaterialization.applyPackTemplate (apply), so both agree
 * on which list line belongs to which template line.
 */

export type TemplateLine = {
  key: string;
  description: string;
  requiredQuantity: number;
  unit: string;
};

export type TemplateListLine = {
  _id: string;
  description: string;
  requiredQuantity: number;
  unit: string;
  packListTemplateId?: string | null;
  templateLineKey?: string | null;
  templateVersion?: number | null;
  followsDishServings?: boolean | null;
  deletedAt?: number | null;
};

export type TemplatePreviewRow = {
  key: string;
  description: string;
  unit: string;
  templateQuantity: number;
  /** add: new line. update: the list follows the template and changes.
   * keptEdit: someone set this line by hand; it stays. same: nothing to do. */
  state: "add" | "update" | "keptEdit" | "same";
  listQuantity: number | null;
  /** The template changed since this line was last applied. */
  templateChanged: boolean;
};

export function templateLineKey(description: string, unit: string): string {
  return `${description.trim().toLowerCase().replace(/\s+/g, " ")}|${unit}`;
}

/** Stored template JSON to clean lines; bad rows are skipped, a unit the
 * list does not know becomes "each", and repeated items keep the first. */
export function parseTemplateLines(
  raw: string | null | undefined,
  knownUnits: readonly string[],
): TemplateLine[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const lines: TemplateLine[] = [];
  for (const row of parsed) {
    if (typeof row !== "object" || row === null) continue;
    const { description, requiredQuantity, unit } = row as Record<
      string,
      unknown
    >;
    if (typeof description !== "string" || description.trim() === "") continue;
    if (typeof requiredQuantity !== "number" || !(requiredQuantity > 0))
      continue;
    const cleanUnit =
      typeof unit === "string" && knownUnits.includes(unit) ? unit : "each";
    const key = templateLineKey(description, cleanUnit);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      key,
      description: description.trim(),
      requiredQuantity,
      unit: cleanUnit,
    });
  }
  return lines;
}

/** What applying the template would do to this pack list. */
export function previewTemplateApplication(input: {
  templateId: string;
  templateVersion: number;
  lines: TemplateLine[];
  listLines: TemplateListLine[];
}): TemplatePreviewRow[] {
  const byKey = new Map(
    input.listLines
      .filter(
        (row) =>
          row.deletedAt == null && row.packListTemplateId === input.templateId,
      )
      .map((row) => [row.templateLineKey ?? "", row]),
  );
  return input.lines.map((line) => {
    const row = byKey.get(line.key);
    if (!row)
      return {
        key: line.key,
        description: line.description,
        unit: line.unit,
        templateQuantity: line.requiredQuantity,
        state: "add",
        listQuantity: null,
        templateChanged: false,
      };
    const listQuantity = Number(row.requiredQuantity);
    const handSet = row.followsDishServings === false;
    const state =
      listQuantity === line.requiredQuantity
        ? "same"
        : handSet
          ? "keptEdit"
          : "update";
    return {
      key: line.key,
      description: row.description,
      unit: row.unit,
      templateQuantity: line.requiredQuantity,
      state,
      listQuantity,
      templateChanged:
        row.templateVersion != null &&
        row.templateVersion !== input.templateVersion,
    };
  });
}
