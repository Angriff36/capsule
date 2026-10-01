// PL-SOURCE-DELTA (AC-272, AC-273, spec CF-6.1-04/05, PR01-04): a repeat
// import of a record that is already in Capsule applies the source change as
// a reviewed delta, never as a second copy and never over a person's edit.
//
// For each compared field it weighs three values: what the import last wrote
// (the link's appliedValues; for links made before this, the record kept on
// the link), what Capsule holds now, and the new source value
// (threeWayReconcile):
//   - Capsule already equals the source  -> nothing to write
//   - Capsule still equals the last import -> write the source value
//   - the source did not change            -> keep Capsule's value
//   - all three differ                     -> an ImportConflict for a person
// The write goes through the generated update command as the signed-in
// person (same access rules as the screen), version-checked; a refused write
// becomes a conflict instead. The baseline, the new source version and the
// review items are saved in one transaction, so a rerun of the same source
// (another device, a restarted worker) finds nothing new to do.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  mergeConflicts,
  threeWayReconcile,
  type FieldConflict,
  type FieldValue,
} from "./lib/culinaryModel/importMapping";
import {
  DATASET_BY_RECORD_TYPE,
  SOURCE_FIELD_MAPS,
  parseValues,
  readStoredValue,
  sourceVersionOf,
  storeValue,
  type SourceDeltaDataset,
} from "./lib/importSourceFields";

export type DeltaOutcome = "resumed" | "unchanged" | "updated" | "conflict";

type Values = Record<string, FieldValue>;
type CapsuleDoc = Record<string, unknown> & { version?: number };

const conflictArg = v.object({
  field: v.string(),
  appliedValue: v.union(v.string(), v.null()),
  capsuleValue: v.union(v.string(), v.null()),
  sourceValue: v.union(v.string(), v.null()),
});

/** Read the Capsule record as the signed-in person (decrypted, access-checked). */
async function readCapsule(
  ctx: ActionCtx,
  dataset: SourceDeltaDataset,
  capsuleId: string,
): Promise<CapsuleDoc | null> {
  try {
    if (dataset === "contacts") {
      return (await ctx.runQuery(api.queries.getClient, {
        id: capsuleId as Id<"clients">,
      })) as CapsuleDoc | null;
    }
    return (await ctx.runQuery(api.queries.getVenue, {
      id: capsuleId as Id<"venues">,
    })) as CapsuleDoc | null;
  } catch {
    return null;
  }
}

/** Optional string args: the update commands clear a field that is left out. */
const keep = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const put = (
  writes: Values,
  doc: CapsuleDoc,
  field: string,
): string | undefined =>
  field in writes ? (keep(writes[field]) ?? undefined) : keep(doc[field]);

/**
 * Write the given source values into the Capsule record through the generated
 * update command, restating every other field as Capsule has it now.
 */
async function writeCapsule(
  ctx: ActionCtx,
  dataset: SourceDeltaDataset,
  capsuleId: string,
  doc: CapsuleDoc,
  writes: Values,
): Promise<void> {
  if (dataset === "contacts") {
    await ctx.runMutation(api.mutations.Client_changeContact, {
      docId: capsuleId as Id<"clients">,
      email: put(writes, doc, "email"),
      phone: put(writes, doc, "phone"),
      website: keep(doc.website),
      addressLine1: keep(doc.addressLine1),
      addressLine2: keep(doc.addressLine2),
      city: keep(doc.city),
      region: keep(doc.region),
      postalCode: keep(doc.postalCode),
      countryCode: keep(doc.countryCode),
      version: doc.version,
    });
    return;
  }
  const venueId = capsuleId as Id<"venues">;
  const { capacity, ...detailWrites } = writes;
  let version = doc.version;
  if (Object.keys(detailWrites).length > 0) {
    const bool = (field: string): boolean | undefined =>
      typeof doc[field] === "boolean" ? (doc[field] as boolean) : undefined;
    const updated = (await ctx.runMutation(api.mutations.Venue_updateDetails, {
      docId: venueId,
      name: put(detailWrites, doc, "name") ?? keep(doc.name) ?? "",
      venueType: doc.venueType,
      onPremise: bool("onPremise"),
      kitchenAccess: keep(doc.kitchenAccess),
      parkingAvailable: bool("parkingAvailable"),
      hasFreightElevator: bool("hasFreightElevator"),
      storageAvailable: bool("storageAvailable"),
      logisticsNotes: keep(doc.logisticsNotes),
      loadInInstructions: keep(doc.loadInInstructions),
      powerAvailable: bool("powerAvailable"),
      waterAccess: bool("waterAccess"),
      hasStairs: bool("hasStairs"),
      wasteRules: keep(doc.wasteRules),
      permitsInsuranceNotes: keep(doc.permitsInsuranceNotes),
      restrictions: keep(doc.restrictions),
      addressLine1: put(detailWrites, doc, "addressLine1"),
      addressLine2: keep(doc.addressLine2),
      city: put(detailWrites, doc, "city"),
      region: put(detailWrites, doc, "region"),
      postalCode: put(detailWrites, doc, "postalCode"),
      countryCode: keep(doc.countryCode),
      latitude: doc.latitude ?? undefined,
      longitude: doc.longitude ?? undefined,
      contactName: put(detailWrites, doc, "contactName"),
      contactEmail: put(detailWrites, doc, "contactEmail"),
      contactPhone: put(detailWrites, doc, "contactPhone"),
      accessNotes: put(detailWrites, doc, "accessNotes"),
      cateringNotes: put(detailWrites, doc, "cateringNotes"),
      version,
    })) as { version?: number } | null;
    version = updated?.version ?? undefined;
  }
  if ("capacity" in writes) {
    await ctx.runMutation(api.mutations.Venue_changeCapacity, {
      docId: venueId,
      capacity: typeof capacity === "number" ? capacity : 0,
      version,
    });
  }
}

function toStored(conflict: FieldConflict) {
  return {
    field: conflict.field,
    appliedValue: storeValue(conflict.appliedValue),
    capsuleValue: storeValue(conflict.capsuleValue),
    sourceValue: storeValue(conflict.sourceValue),
  };
}

/**
 * Bring one already-linked record up to a new source row. Called by
 * importCommit for a link that an earlier run made.
 */
export async function reconcileExistingLink(
  ctx: ActionCtx,
  args: {
    dataset: SourceDeltaDataset;
    link: Doc<"externalRecordLinks">;
    record: object;
    rawSourceData: string;
    importRunId: Id<"importRuns">;
  },
): Promise<DeltaOutcome> {
  const { link, dataset } = args;
  // This run already handled the link (resume after a lost answer).
  if (link.lastSeenImportRunId === String(args.importRunId)) return "resumed";

  const map = SOURCE_FIELD_MAPS[dataset];
  const source = map.fromSource(args.record as Record<string, unknown>);
  const sourceVersion = sourceVersionOf(source);
  const baseline =
    parseValues(link.appliedValues) ??
    (() => {
      const kept = parseValues(link.rawSourceData);
      return kept ? map.fromSource(kept) : null;
    })();

  const doc = await readCapsule(ctx, dataset, link.capsuleId);
  if (!doc) {
    // The record is gone or this person cannot open it: note the sighting only.
    await ctx.runMutation(internal.importSourceDelta.recordDelta, {
      linkId: link._id,
      importRunId: String(args.importRunId),
      sourceVersion,
      rawSourceData: args.rawSourceData,
      appliedValues: null,
      conflicts: [],
    });
    return "unchanged";
  }

  const result = threeWayReconcile({
    applied: baseline,
    capsule: map.fromCapsule(doc),
    source,
    fields: map.fields,
  });
  const conflicts = [...result.conflicts];
  const newApplied: Values = { ...result.newApplied };
  const writes: Values = {};
  for (const [field, value] of Object.entries(result.writes)) {
    if (map.writable.includes(field)) {
      writes[field] = value;
      continue;
    }
    // No import command may change this field: a person decides.
    conflicts.push({
      field,
      appliedValue: baseline?.[field] ?? null,
      capsuleValue: map.fromCapsule(doc)[field] ?? null,
      sourceValue: value,
    });
    newApplied[field] = baseline?.[field] ?? null;
  }

  let wrote = false;
  if (Object.keys(writes).length > 0) {
    try {
      await writeCapsule(ctx, dataset, link.capsuleId, doc, writes);
      wrote = true;
    } catch {
      // Someone saved the record meanwhile, or the save was refused: never
      // force it. Each field becomes a review item instead.
      const now = map.fromCapsule(doc);
      for (const field of Object.keys(writes)) {
        conflicts.push({
          field,
          appliedValue: baseline?.[field] ?? null,
          capsuleValue: now[field] ?? null,
          sourceValue: writes[field] ?? null,
        });
        newApplied[field] = baseline?.[field] ?? null;
      }
    }
  }

  await ctx.runMutation(internal.importSourceDelta.recordDelta, {
    linkId: link._id,
    importRunId: String(args.importRunId),
    sourceVersion,
    rawSourceData: args.rawSourceData,
    appliedValues: JSON.stringify(newApplied),
    conflicts: conflicts.map(toStored),
  });
  // The same source revision again: open review items stay as they are
  // (mergeConflicts leaves them alone), so they are not news this time.
  if (conflicts.length > 0 && link.sourceVersion !== sourceVersion) {
    return "conflict";
  }
  return wrote ? "updated" : "unchanged";
}

/**
 * Save the outcome of one repeat import on the link, in one transaction: the
 * new applied baseline, the source version and sighting, and the review
 * items (a still-open item for the same field is updated, not doubled; a
 * settled item comes back only when the source value changes again).
 */
export const recordDelta = internalMutation({
  args: {
    linkId: v.id("externalRecordLinks"),
    importRunId: v.string(),
    sourceVersion: v.string(),
    rawSourceData: v.string(),
    appliedValues: v.union(v.string(), v.null()),
    conflicts: v.array(conflictArg),
  },
  handler: async (ctx, args): Promise<void> => {
    const link = await ctx.db.get(args.linkId);
    if (!link || link.deletedAt != null) return;
    const now = Date.now();
    const existing = await ctx.db
      .query("importConflicts")
      .withIndex("by_externalRecordLinkId", (q) =>
        q.eq("externalRecordLinkId", args.linkId),
      )
      .filter((q) => q.eq(q.field("deletedAt"), null))
      .take(100);
    const actions = mergeConflicts(
      existing.map((row) => ({
        id: row._id,
        field: row.field,
        sourceValue: readStoredValue(row.sourceValue),
        status: row.status,
        resolvedOnSourceVersion: row.resolvedOnSourceVersion,
      })),
      args.conflicts.map((c) => ({
        field: c.field,
        appliedValue: readStoredValue(c.appliedValue),
        capsuleValue: readStoredValue(c.capsuleValue),
        sourceValue: readStoredValue(c.sourceValue),
      })),
      args.sourceVersion,
    );
    for (const step of actions) {
      if (step.action === "noop") continue;
      const stored = toStored(step.conflict);
      if (step.action === "update") {
        const row = existing.find((r) => r._id === step.id);
        if (!row) continue;
        await ctx.db.patch(row._id, {
          appliedValue: stored.appliedValue,
          capsuleValue: stored.capsuleValue,
          sourceValue: stored.sourceValue,
          sourceVersion: args.sourceVersion,
          status: "pending",
          updatedAt: now,
          version: row.version + 1,
        });
        continue;
      }
      await ctx.db.insert("importConflicts", {
        tenantId: link.tenantId,
        deletedAt: null,
        externalRecordLinkId: link._id,
        field: stored.field,
        appliedValue: stored.appliedValue,
        capsuleValue: stored.capsuleValue,
        sourceValue: stored.sourceValue,
        sourceVersion: args.sourceVersion,
        status: "pending",
        raisedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
    }
    await ctx.db.patch(link._id, {
      ...(args.appliedValues != null
        ? {
            appliedValues: args.appliedValues,
            appliedSourceVersion: args.sourceVersion,
            appliedAt: now,
            appliedImportRunId: args.importRunId,
          }
        : {}),
      sourceVersion: args.sourceVersion,
      rawSourceData: args.rawSourceData,
      lastSeenAt: now,
      lastSeenImportRunId: args.importRunId,
      updatedAt: now,
      version: link.version + 1,
    });
  },
});

export const loadConflict = internalQuery({
  args: { conflictId: v.id("importConflicts") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    // Same import access as importCommit.canImport (managers + system).
    const role = auth.role;
    const canImport =
      role === "manager" ||
      role === "admin" ||
      role === "owner" ||
      role === "system" ||
      role.endsWith("_manager");
    if (!canImport) return null;
    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict || conflict.deletedAt != null) return null;
    if (conflict.tenantId !== auth.tenantId) return null;
    const link = await ctx.db.get(conflict.externalRecordLinkId);
    if (!link || link.deletedAt != null || link.tenantId !== auth.tenantId) {
      return null;
    }
    return { conflict, link };
  },
});

/** Move one field of the applied baseline after a person took the source value. */
export const recordTakenValue = internalMutation({
  args: {
    linkId: v.id("externalRecordLinks"),
    field: v.string(),
    value: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args): Promise<void> => {
    const link = await ctx.db.get(args.linkId);
    if (!link) return;
    const applied = parseValues(link.appliedValues) ?? {};
    applied[args.field] = readStoredValue(args.value);
    await ctx.db.patch(link._id, {
      appliedValues: JSON.stringify(applied),
      appliedAt: Date.now(),
      updatedAt: Date.now(),
      version: link.version + 1,
    });
  },
});

/**
 * "Use the new value" on a review item: write the source value into the
 * Capsule record as the signed-in person, then settle the item. A field no
 * import may write is changed on the record itself, then settled as "fixed
 * another way".
 */
export const takeSourceValue = action({
  args: { conflictId: v.id("importConflicts") },
  handler: async (ctx, args): Promise<void> => {
    const loaded = await ctx.runQuery(internal.importSourceDelta.loadConflict, {
      conflictId: args.conflictId,
    });
    if (!loaded) throw new ConvexError("This change is no longer waiting.");
    const { conflict, link } = loaded;
    if (conflict.status !== "pending") {
      throw new ConvexError("This change was already settled.");
    }
    const dataset = DATASET_BY_RECORD_TYPE[link.recordType];
    if (!dataset) {
      throw new ConvexError("Capsule cannot apply this kind of change here.");
    }
    const map = SOURCE_FIELD_MAPS[dataset];
    if (!map.writable.includes(conflict.field)) {
      throw new ConvexError(
        `Change the ${map.labels[conflict.field] ?? conflict.field} on the record, then mark this as fixed another way.`,
      );
    }
    const doc = await readCapsule(ctx, dataset, link.capsuleId);
    if (!doc) throw new ConvexError("The record could not be opened.");
    const value = readStoredValue(conflict.sourceValue);
    await writeCapsule(ctx, dataset, link.capsuleId, doc, {
      [conflict.field]: value ?? null,
    });
    await ctx.runMutation(api.mutations.ImportConflict_settle, {
      docId: conflict._id,
      resolution: "take_source",
      version: conflict.version,
    });
    await ctx.runMutation(internal.importSourceDelta.recordTakenValue, {
      linkId: link._id,
      field: conflict.field,
      value: conflict.sourceValue ?? null,
    });
  },
});
