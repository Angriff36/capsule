// Import Coordinator — starts ImportRun rows and serves the run read models.
//
// ~~Main import orchestrator coordinating parsing, validation, review, commit phases.~~
// Corrected 2026-09-29: the parse/validate/review/commit/fail/revert pipeline
// that lived here (progressImportStage, parseTppData, parseTppImport,
// validateParsedData, validateImport, beginReview, approveReview,
// commitImport, finalizeImport, markImportFailed, revertImport) had no
// callers in src/, convex/, tests/, scripts/, http routes or crons and was
// deleted. Its commit step marked runs completed without writing any data,
// and markImportFailed had no role check. The live pipeline is
// quickImport.ts (stages via generated ImportRun commands) and
// importCommit.ts (the real commit/revert).

import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

/**
 * Import coordinator interfaces
 */
interface ImportContext {
  importRun: Doc<"importRuns">;
  tenantId: string;
  actorId: string;
}

/**
 * Dataset types matching ImportRun manifest
 */
const DATASET_TYPES = [
  "events",
  "contacts",
  "leads",
  "menus",
  "venues",
  "payments",
  "pack_list",
] as const;
type DatasetType = (typeof DATASET_TYPES)[number];

/**
 * Source systems matching ImportRun manifest
 */
const SOURCE_SYSTEMS = ["tpp_legacy", "csv_export", "api_sync"] as const;
type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

/**
 * Validate dataset type
 */
function isValidDatasetType(value: string): value is DatasetType {
  return DATASET_TYPES.includes(value as DatasetType);
}

/**
 * Validate source system
 */
function isValidSourceSystem(value: string): value is SourceSystem {
  return SOURCE_SYSTEMS.includes(value as SourceSystem);
}

/**
 * Check if a role has import access
 */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

/**
 * Require import access permission
 */
function requireImportAccess(role: string): void {
  if (!canImport(role)) {
    throw new ConvexError("Only organization managers can perform imports.");
  }
}

/**
 * ========================================================================
 * PUBLIC API — Import run lifecycle
 * ========================================================================
 */

/**
 * Start a new import run
 */
export const startImport = mutation({
  args: {
    sourceSystem: v.string(),
    datasetType: v.string(),
    checksum: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    requireTenant(auth);
    requireImportAccess(auth.role);

    if (!isValidSourceSystem(args.sourceSystem)) {
      throw new ConvexError(
        `Invalid source system: ${args.sourceSystem}. Must be one of: ${SOURCE_SYSTEMS.join(", ")}`,
      );
    }

    if (!isValidDatasetType(args.datasetType)) {
      throw new ConvexError(
        `Invalid dataset type: ${args.datasetType}. Must be one of: ${DATASET_TYPES.join(", ")}`,
      );
    }

    // Governed create (2026-09-29): ImportRun_createViaStart stamps the
    // timestamps and the archive/disposition/commit defaults the old raw
    // insert wrote, and emits ImportRunStarted. Same transaction, caller auth
    // (every canImport role holds importAccess, the command's policy).
    const created = (await ctx.runMutation(
      api.mutations.ImportRun_createViaStart,
      {
        sourceSystem: args.sourceSystem,
        datasetType: args.datasetType,
        actorId: auth.id,
        checksum: args.checksum,
      },
    )) as { docId: Id<"importRuns"> };
    const importRunId = created.docId;

    return { importRunId };
  },
});

/**
 * Get import run status
 */
export const getImportRunStatus = query({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    // Parse record counts if present
    let parsedCounts: Record<string, number> | null = null;
    try {
      parsedCounts = JSON.parse(importRun.recordCounts) as Record<
        string,
        number
      >;
    } catch {
      // Invalid JSON, leave as null
    }

    // Commit-stage resume checkpoint (R2-6) — processed counts + cursor.
    let parsedCheckpoint: Record<string, unknown> | null = null;
    try {
      parsedCheckpoint = JSON.parse(
        importRun.commitCheckpoint ?? "{}",
      ) as Record<string, unknown>;
    } catch {
      // Invalid JSON, leave as null
    }

    return {
      id: importRun._id,
      status: importRun.status,
      sourceSystem: importRun.sourceSystem,
      datasetType: importRun.datasetType,
      startTime: importRun.startTime,
      endTime: importRun.endTime,
      completionTime: importRun.completionTime,
      parsedAt: importRun.parsedAt,
      validatedAt: importRun.validatedAt,
      reviewStartedAt: importRun.reviewStartedAt,
      reviewApprovedAt: importRun.reviewApprovedAt,
      commitStartedAt: importRun.commitStartedAt,
      recordCounts: parsedCounts,
      commitCheckpoint: parsedCheckpoint,
      checksum: importRun.checksum,
      actorId: importRun.actorId,
      failureDetails: importRun.failureDetails,
      createdAt: importRun.createdAt,
      updatedAt: importRun.updatedAt,
    };
  },
});

/**
 * List import runs for tenant
 */
export const listImportRuns = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    const query = ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId));

    const results = await (
      args.status ? query.filter((q) => q.eq("status", args.status)) : query
    )
      .order("desc")
      .take(args.limit ?? 50);

    return results.map((run: Doc<"importRuns">) => ({
      id: run._id,
      status: run.status,
      sourceSystem: run.sourceSystem,
      datasetType: run.datasetType,
      startTime: run.startTime,
      recordCounts: run.recordCounts,
      actorId: run.actorId,
      failureDetails: run.failureDetails,
    }));
  },
});

/**
 * ========================================================================
 * INTERNAL API — Stage progression
 * ========================================================================
 */

/**
 * Load import run context for internal operations
 */
export const loadImportContext = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<ImportContext | null> => {
    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.deletedAt != null) {
      return null;
    }

    return {
      importRun,
      tenantId: importRun.tenantId,
      actorId: importRun.actorId,
    };
  },
});
