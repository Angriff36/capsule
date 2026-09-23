import type { RecordedUnitMapping } from "./quantityMoney";

const MAPPING_KINDS = new Set(["pack", "density", "portion", "yield"]);

/**
 * Live ItemUnitMapping rows in the shape the cost engine accepts. AC-406 /
 * BE §6.4: only a recorded mapping with provenance may cross count or
 * density, so retired or malformed rows are dropped — never defaulted.
 */
export class RecordedUnitMappings {
  static fromRows(
    rows: readonly unknown[] | null | undefined,
  ): RecordedUnitMapping[] {
    if (!rows) return [];
    const kept: RecordedUnitMapping[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      if (record.deletedAt != null) continue;
      if (typeof record.kind !== "string" || !MAPPING_KINDS.has(record.kind)) {
        continue;
      }
      if (typeof record.unit !== "string" || record.unit === "") continue;
      if (typeof record.equalsUnit !== "string" || record.equalsUnit === "") {
        continue;
      }
      const equalsQuantity = Number(record.equalsQuantity);
      if (!Number.isFinite(equalsQuantity) || equalsQuantity <= 0) continue;
      const mapping: RecordedUnitMapping = {
        kind: record.kind as RecordedUnitMapping["kind"],
        unit: record.unit,
        equalsQuantity,
        equalsUnit: record.equalsUnit,
      };
      if (typeof record.ingredientId === "string" && record.ingredientId) {
        mapping.ingredientId = record.ingredientId;
      }
      kept.push(mapping);
    }
    return kept;
  }
}
