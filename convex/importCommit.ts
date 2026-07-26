/**
 * AUTHOR SEAM — real ImportRun commit/revert (spec §6.1 / §6.2 / §5.3).
 *
 * Why this exists: the generated `ImportRun_commit` / `ImportRun_revert` commands
 * (convex/mutations.ts, do-not-edit) only flip the run's status + emit an audit
 * event — they write ZERO business data. The orphaned `importCoordinator.ts`
 * `commitImport`/`revertImport` carry explicit TODOs. So an operator clicking
 * "Complete Commit" got a green "Completed" run with no records imported (silent
 * false-success), and §5.3's "imported TPP Event uses the same create-proposal
 * command" had no imported events to act on.
 *
 * This seam makes commit/revert REAL for the self-contained **venues** dataset:
 * caller-supplied TPP venue rows are parsed, materialized into Venue entities via
 * the generated `Venue_createViaRegister` (handles encryption + eventManageAccess
 * guard), and linked idempotently through ExternalRecordLink. Re-run is safe
 * (Venue idempotencyKey + link dedup). Revert supersedes the run's links.
 *
 * ponytail: ceiling — only venues ship here. Events/leads/payments reference
 * external client/venue IDs that need cross-dataset resolution (import contacts
 * before events, resolve externalId→Capsule id), which is a separate slice; this
 * action throws an honest "not yet supported" for them rather than faking it.
 * Revert supersedes links but leaves imported Venue entities in place (an event
 * may already reference one; deactivation is an operator action) — documented
 * honesty, not silent deletion. Source rows are caller-supplied (TPP has no bulk
 * export, spec §6.3), so this is the manual/JSON-paste migration path.
 */
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import { parseTppVenues, type TppVenueRecord } from "./tppParser";
import type { Doc, Id } from "./_generated/dataModel";

/** Import access matches `importCoordinator.canImport` (managers + system). */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

type CommitContext = {
  role: string;
  tenantId: string;
  actorId: string;
  importRun: Doc<"importRuns">;
};

/** Full-fidelity auth (query has ctx.db) + the run, in one read. */
export const loadCommitContext = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<CommitContext | null> => {
    const auth = await getAuthContext(ctx);
    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.deletedAt != null) return null;
    return {
      role: auth.role,
      tenantId: auth.tenantId,
      actorId: auth.id,
      importRun,
    };
  },
});

/**
 * Find an existing ACTIVE (non-superseded), non-deleted link for
 * (tenant, source, recordType, externalId). Excluding superseded matters: after
 * a revert, re-importing the same external venue must NOT be treated as an
 * idempotent skip (the old link is superseded, not active) — it should
 * re-materialize + reactivate.
 */
export const findLink = internalQuery({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks"> | null> => {
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sourceSystem"), args.sourceSystem),
          q.eq(q.field("recordType"), args.recordType),
          q.eq(q.field("externalId"), args.externalId),
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .first();
  },
});

/**
 * Active (non-superseded), non-deleted links created by a given import run.
 * Bounded per page; `revertImportRun` pages until exhausted (superseding a
 * batch drops it from the next query), so a run with >500 links fully reverts.
 */
export const linksForRun = internalQuery({
  args: { sourceImportRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks">[]> => {
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_sourceImportRunId", (q) =>
        q.eq("sourceImportRunId", args.sourceImportRunId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .take(500);
  },
});

/** Insert or update the link for a (tenant, source, recordType, externalId) key. */
export const upsertLink = internalMutation({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
    capsuleEntity: v.string(),
    capsuleId: v.string(),
    sourceImportRunId: v.id("importRuns"),
    rawSourceData: v.string(),
    conflictStatus: v.union(
      v.literal("resolved"),
      v.literal("pending_conflict"),
    ),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"externalRecordLinks">> => {
    const existing = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sourceSystem"), args.sourceSystem),
          q.eq(q.field("recordType"), args.recordType),
          q.eq(q.field("externalId"), args.externalId),
          q.eq(q.field("deletedAt"), null),
        ),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        capsuleEntity:
          args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
        capsuleId: args.capsuleId,
        sourceImportRunId: args.sourceImportRunId,
        rawSourceData: args.rawSourceData,
        conflictStatus: args.conflictStatus,
        resolutionNote: args.resolutionNote ?? existing.resolutionNote,
        updatedAt: now,
        version: existing.version + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("externalRecordLinks", {
      tenantId: args.tenantId,
      sourceSystem:
        args.sourceSystem as Doc<"externalRecordLinks">["sourceSystem"],
      recordType: args.recordType,
      externalId: args.externalId,
      capsuleEntity:
        args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
      capsuleId: args.capsuleId,
      verified: false,
      sourceImportRunId: args.sourceImportRunId,
      rawSourceData: args.rawSourceData,
      conflictStatus: args.conflictStatus,
      resolutionNote: args.resolutionNote,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
  },
});

/** Mark a link superseded (revert). */
export const supersedeLink = internalMutation({
  args: { linkId: v.id("externalRecordLinks"), version: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.linkId, {
      conflictStatus: "superseded",
      effectiveEndDate: now,
      verified: false,
      lastVerifiedAt: now,
      updatedAt: now,
      version: args.version + 1,
    });
  },
});

export type CommitResult = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
};

/**
 * Commit a venues ImportRun: parse caller-supplied TPP rows → materialize Venue
 * entities → idempotent ExternalRecordLinks → flip the run to completed via the
 * generated command. Per-record failures become pending_conflict links (visible
 * in the reconcile queue) rather than failing the whole run.
 */
export const commitImportRun = action({
  args: {
    importRunId: v.id("importRuns"),
    rawRows: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<CommitResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can commit imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "committing") {
      throw new ConvexError(
        `Import run must be in 'committing' status to commit, current: ${importRun.status}`,
      );
    }
    if (importRun.datasetType !== "venues") {
      // ponytail: ceiling — venues only this increment (see module header).
      throw new ConvexError(
        `Dataset '${importRun.datasetType}' import is not yet supported (venues only). Events/leads/payments need cross-dataset ID resolution.`,
      );
    }
    if (args.rawRows.length === 0) {
      throw new ConvexError("No source rows provided — nothing to commit.");
    }

    const parsed = parseTppVenues(args.rawRows as TppVenueRecord[]);
    if (parsed.records.length === 0) {
      // Non-empty input that yields zero valid records (all rows failed to
      // parse) must NOT silently flip the run to completed.
      throw new ConvexError(
        `No valid venue records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
      );
    }
    const sourceSystem = importRun.sourceSystem;
    let committed = 0;
    let skipped = 0;
    let pending = 0;

    for (const venue of parsed.records) {
      const existing = await ctx.runQuery(internal.importCommit.findLink, {
        tenantId,
        sourceSystem,
        recordType: "venue",
        externalId: venue.externalId,
      });
      if (existing && existing.capsuleId) {
        // Already materialized in a prior run — idempotent skip.
        skipped += 1;
        continue;
      }

      const idempotencyKey = `import:${args.importRunId}:venue:${venue.externalId}`;
      try {
        const created = await ctx.runMutation(
          api.mutations.Venue_createViaRegister,
          {
            name: venue.name,
            venueType: venue.venueType ?? "other",
            capacity: venue.capacity ?? 0,
            addressLine1: venue.addressLine1,
            city: venue.city,
            region: venue.region,
            postalCode: venue.postalCode,
            contactName: venue.contactName,
            contactEmail: venue.contactEmail,
            contactPhone: venue.contactPhone,
            accessNotes: venue.accessNotes,
            cateringNotes: venue.cateringNotes,
            idempotencyKey,
          },
        );
        const venueId: string = (created as { docId: string }).docId;
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: venueId,
          sourceImportRunId: args.importRunId,
          rawSourceData: JSON.stringify(venue),
          conflictStatus: "resolved",
        });
        committed += 1;
      } catch (cause) {
        // Per-record failure (e.g. eventManageAccess denied) → review queue.
        const note =
          cause instanceof Error
            ? cause.message
            : "Venue materialization failed";
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: "",
          sourceImportRunId: args.importRunId,
          rawSourceData: JSON.stringify(venue),
          conflictStatus: "pending_conflict",
          resolutionNote: note,
        });
        pending += 1;
      }
    }

    if (committed === 0 && pending > 0) {
      throw new ConvexError(
        `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
      );
    }

    // Flip the run to completed via the generated command (transition guard +
    // ImportRunCommitted event + OCC). Version is unchanged since the run was
    // last read (venue/link writes do not touch importRuns).
    await ctx.runMutation(api.mutations.ImportRun_commit, {
      docId: args.importRunId,
      version: importRun.version,
    });

    return {
      committed,
      skipped,
      pending,
      parseErrors: parsed.errors.length,
    };
  },
});

export type RevertResult = { rolledBack: number };

/**
 * Revert a completed ImportRun: supersede every link it created. Imported Venue
 * entities are left in place (an event may already reference one); superseding
 * the link removes the active mapping and surfaces the records for operator
 * deactivation. Then flip the run to reverted via the generated command.
 */
export const revertImportRun = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<RevertResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can revert imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "completed") {
      throw new ConvexError(
        `Only completed imports can be reverted, current: ${importRun.status}`,
      );
    }

    // Page through ALL active links the run created. linksForRun returns only
    // non-superseded links; superseding a batch drops those rows from the next
    // query, so this terminates and fully reverts even a >500-link run.
    let rolledBack = 0;
    for (;;) {
      const batch = await ctx.runQuery(internal.importCommit.linksForRun, {
        sourceImportRunId: args.importRunId,
      });
      if (batch.length === 0) break;
      for (const link of batch) {
        await ctx.runMutation(internal.importCommit.supersedeLink, {
          linkId: link._id,
          version: link.version,
        });
        rolledBack += 1;
      }
      if (batch.length < 500) break; // last partial page
    }

    await ctx.runMutation(api.mutations.ImportRun_revert, {
      docId: args.importRunId,
      version: importRun.version,
    });

    return { rolledBack };
  },
});
