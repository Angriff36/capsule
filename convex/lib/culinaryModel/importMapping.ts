// Revision-2 culinary model (2026-09-14) — permanent identity and re-import.
//
// Identity = (sourceSystem, sourceAccount, recordType, externalId, role,
// ordinal). Names are never identity. Three-way reconcile compares the value
// last APPLIED by import, the CURRENT Capsule value and the NEW source value:
//   capsule == source            -> no write, no conflict, baseline advances
//   capsule == applied           -> write source, baseline advances
//   source  == applied           -> keep Capsule, baseline unchanged
//   all three differ             -> conflict (pending), nothing written
// A pending conflict with an unchanged source value is never raised twice.
// Absence from a run leaves the link alone: exports are filtered.

export interface LinkIdentity {
  sourceSystem: string;
  sourceAccount: string | null | undefined;
  recordType: string;
  externalId: string;
  role: string | null | undefined;
  ordinal: number | null | undefined;
}

export const buildLinkKey = (id: LinkIdentity): string =>
  [id.sourceSystem, id.sourceAccount ?? "", id.recordType, id.externalId, id.role ?? "", String(id.ordinal ?? 0)].join("|");

export const parseLinkKey = (key: string): LinkIdentity | null => {
  const parts = key.split("|");
  if (parts.length !== 6) return null;
  const ordinal = Number(parts[5]);
  return {
    sourceSystem: parts[0],
    sourceAccount: parts[1] || null,
    recordType: parts[2],
    externalId: parts[3],
    role: parts[4] || null,
    ordinal: Number.isFinite(ordinal) ? ordinal : 0,
  };
};

export type FieldValue = string | number | boolean | null | undefined | FieldValue[] | { [key: string]: FieldValue };

const normalize = (value: FieldValue): FieldValue => {
  if (value === undefined) return null;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: { [key: string]: FieldValue } = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
    return out;
  }
  return value;
};

export const valuesEqual = (a: FieldValue, b: FieldValue): boolean =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

export interface FieldConflict {
  field: string;
  appliedValue: FieldValue;
  capsuleValue: FieldValue;
  sourceValue: FieldValue;
}

export interface ThreeWayInput {
  /** Values last written by import, or null when this link never applied. */
  applied: Record<string, FieldValue> | null;
  capsule: Record<string, FieldValue>;
  source: Record<string, FieldValue>;
  fields: readonly string[];
}

export interface ThreeWayResult {
  /** Fields to write into Capsule with the source value. */
  writes: Record<string, FieldValue>;
  /** Fields where Capsule already equals the source (baseline advances, no write). */
  agreed: string[];
  /** Fields kept as Capsule has them (source unchanged since last apply). */
  kept: string[];
  conflicts: FieldConflict[];
  /** New applied baseline to persist after this run. */
  newApplied: Record<string, FieldValue>;
}

export function threeWayReconcile(input: ThreeWayInput): ThreeWayResult {
  const writes: Record<string, FieldValue> = {};
  const agreed: string[] = [];
  const kept: string[] = [];
  const conflicts: FieldConflict[] = [];
  const newApplied: Record<string, FieldValue> = { ...(input.applied ?? {}) };
  for (const field of input.fields) {
    const a: FieldValue = input.applied ? input.applied[field] : undefined;
    const c: FieldValue = input.capsule[field];
    const s: FieldValue = input.source[field];
    if (valuesEqual(c, s)) {
      agreed.push(field);
      newApplied[field] = s ?? null;
      continue;
    }
    if (input.applied == null || valuesEqual(c, a)) {
      writes[field] = s ?? null;
      newApplied[field] = s ?? null;
      continue;
    }
    if (valuesEqual(s, a)) {
      kept.push(field);
      continue;
    }
    conflicts.push({ field, appliedValue: a ?? null, capsuleValue: c ?? null, sourceValue: s ?? null });
  }
  return { writes, agreed, kept, conflicts, newApplied };
}

export type ImportConflictStatus = "pending" | "keep_capsule" | "take_source" | "manual";

export interface ExistingConflict {
  id: string;
  field: string;
  sourceValue: FieldValue;
  status: ImportConflictStatus;
  resolvedOnSourceVersion?: string | null;
}

export type ConflictAction =
  | { action: "raise"; conflict: FieldConflict }
  | { action: "update"; id: string; conflict: FieldConflict }
  | { action: "noop"; id: string; field: string };

/**
 * Decide what to do with each new conflict given the conflicts already on
 * file. Unchanged pending conflicts are left alone. A resolved conflict is
 * reopened (updated) only when the source value differs from the one it was
 * resolved on.
 */
export function mergeConflicts(
  existing: readonly ExistingConflict[],
  next: readonly FieldConflict[],
  sourceVersion: string | null,
): ConflictAction[] {
  const actions: ConflictAction[] = [];
  for (const conflict of next) {
    const pending = existing.find((e) => e.field === conflict.field && e.status === "pending");
    if (pending) {
      actions.push(
        valuesEqual(pending.sourceValue, conflict.sourceValue)
          ? { action: "noop", id: pending.id, field: conflict.field }
          : { action: "update", id: pending.id, conflict },
      );
      continue;
    }
    const resolved = existing.find((e) => e.field === conflict.field && e.status !== "pending");
    if (resolved) {
      const sameVersion = sourceVersion != null && resolved.resolvedOnSourceVersion === sourceVersion;
      if (sameVersion || valuesEqual(resolved.sourceValue, conflict.sourceValue)) {
        actions.push({ action: "noop", id: resolved.id, field: conflict.field });
        continue;
      }
      actions.push({ action: "update", id: resolved.id, conflict });
      continue;
    }
    actions.push({ action: "raise", conflict });
  }
  return actions;
}

export interface SourceDeletionEvidence {
  recordDeleted?: boolean | null;
  deletedDate?: string | null;
  discontinued?: boolean | null;
}

export type AbsenceDecision = "keep" | "supersede";

/**
 * A record missing from a run proves nothing when the export is filtered
 * (this one is: 255 dishes plus reachable sub-items). Supersede only on
 * explicit deletion evidence in the source, or on a full-catalog run with
 * approval.
 */
export function absenceDecision(args: {
  seenInRun: boolean;
  runIsFullCatalog: boolean;
  approvedSupersede: boolean;
  evidence?: SourceDeletionEvidence | null;
}): AbsenceDecision {
  if (args.seenInRun) return "keep";
  const e = args.evidence;
  if (e && (e.recordDeleted === true || (e.deletedDate ?? "").length > 0 || e.discontinued === true)) return "supersede";
  if (args.runIsFullCatalog && args.approvedSupersede) return "supersede";
  return "keep";
}

/** Assign ordinals once: existing (role -> ordinals) are kept, new records take the next free slot. */
export function assignOrdinal(existingOrdinals: readonly number[], preferred?: number): number {
  if (preferred != null && !existingOrdinals.includes(preferred)) return preferred;
  let candidate = 0;
  const taken = new Set(existingOrdinals);
  while (taken.has(candidate)) candidate += 1;
  return candidate;
}
