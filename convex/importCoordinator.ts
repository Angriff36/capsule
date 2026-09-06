// Import Coordinator — Main import orchestrator coordinating parsing, validation, review, commit phases.
// Follows qboSync.ts and googleCalendar.ts patterns for integration with ImportRun and ExternalRecordLink entities.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  isValidTransition,
  getRequiredPreconditions,
  getErrorStrategy,
  validateRecordCounts,
  ImportStage,
  type ValidationResult,
  ImportProgressArgs,
  RecordCountsArgs,
  FailureDetailsArgs,
} from "./importPipeline";
import {
  parseTppEvents,
  parseTppContacts,
  parseTppVenues,
  parseTppPayments,
  generateRecordCounts,
  TppParseArgs,
  type ParserResult,
  type ParsedCapsuleEvent,
  type ParsedCapsuleContact,
  type ParsedCapsuleVenue,
  type ParsedCapsulePayment,
} from "./tppParser";

/**
 * Import coordinator interfaces
 */
interface ImportContext {
  importRun: Doc<"importRuns">;
  tenantId: string;
  actorId: string;
}

interface ImportResult {
  success: boolean;
  stage: ImportStage;
  recordCounts?: Record<string, number>;
  errors?: Array<{ field: string; message: string }>;
  warnings?: Array<{ field: string; message: string }>;
  failureReason?: string;
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
 * Validation helpers
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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
    const tenantId = requireTenant(auth);
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

    const importRunId = await ctx.db.insert("importRuns", {
      tenantId,
      sourceSystem: args.sourceSystem as
        "tpp_legacy" | "csv_export" | "api_sync",
      datasetType: args.datasetType as
        | "events"
        | "contacts"
        | "leads"
        | "menus"
        | "venues"
        | "payments"
        | "pack_list",
      status: "started" as const,
      startTime: Date.now(),
      recordCounts: "{}",
      actorId: auth.id,
      archiveWorkbookCount: 0,
      indexWorkbookCount: 0,
      discrepancyExplained: false,
      dispositionCounts: "{}",
      unaccountedRecordCount: 0,
      commitCheckpoint: "{}",
      checksum: args.checksum ?? undefined,
      // Timestamps-mixin fields: commands (recordArchiveInventory,
      // explainArchiveDiscrepancy, …) guard on createdAt being present, so
      // the authored insert stamps them exactly like a command-created row.
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 0,
    });

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

/**
 * Progress import run to next stage
 */
export const progressImportStage = internalMutation({
  args: {
    importRunId: v.id("importRuns"),
    toStage: v.string(),
    recordCounts: v.optional(v.string()),
    failureDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.deletedAt != null) {
      throw new ConvexError("Import run not found");
    }

    const context = {
      importRun,
      tenantId: importRun.tenantId,
      actorId: importRun.actorId,
    };

    const fromStage = importRun.status;
    const toStage = args.toStage as ImportStage;

    // Validate transition
    if (!isValidTransition(fromStage, toStage)) {
      throw new ConvexError(
        `Invalid transition from ${fromStage} to ${toStage}`,
      );
    }

    // Check preconditions
    const preconditions = getRequiredPreconditions(toStage);
    for (const condition of preconditions) {
      // Implement precondition checks
      if (condition.includes("actorId") && !context.actorId) {
        throw new ConvexError(`Precondition failed: ${condition}`);
      }
    }

    const updates: Partial<Doc<"importRuns">> = {
      status: toStage,
      updatedAt: Date.now(),
    };

    // Stage-specific updates
    switch (toStage) {
      case "parsing":
        updates.parsedAt = Date.now();
        if (args.recordCounts) {
          updates.recordCounts = args.recordCounts;
        }
        break;
      case "validating":
        updates.validatedAt = Date.now();
        break;
      case "reviewing":
        updates.reviewStartedAt = Date.now();
        break;
      case "committing":
        updates.reviewApprovedAt = Date.now();
        if (args.recordCounts) {
          updates.recordCounts = args.recordCounts;
        }
        updates.commitStartedAt = Date.now();
        break;
      case "completed":
        updates.completionTime = Date.now();
        updates.endTime = Date.now();
        break;
      case "failed":
        updates.endTime = Date.now();
        if (args.failureDetails) {
          updates.failureDetails = args.failureDetails;
        }
        break;
      case "reverted":
        updates.revertedAt = Date.now();
        updates.endTime = Date.now();
        break;
    }

    await ctx.db.patch(args.importRunId, updates);

    // Create external record links for successful parsing
    if (toStage === "parsing" && args.recordCounts) {
      // Links will be created during commit phase
    }
  },
});

/**
 * ========================================================================
 * PARSING STAGE
 * ========================================================================
 */

/**
 * Parse TPP data (internal action)
 */
export const parseTppData = internalAction({
  args: {
    importRunId: v.id("importRuns"),
    datasetType: v.string(),
    rawData: v.array(v.any()),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    let parseResult: ParserResult<unknown>;

    switch (args.datasetType) {
      case "events":
        parseResult = parseTppEvents(args.rawData as any[]);
        break;
      case "contacts":
        parseResult = parseTppContacts(args.rawData as any[]);
        break;
      case "venues":
        parseResult = parseTppVenues(args.rawData as any[]);
        break;
      case "payments":
        parseResult = parseTppPayments(args.rawData as any[]);
        break;
      default:
        return {
          success: false,
          stage: "parsing",
          errors: [
            {
              field: "datasetType",
              message: `Unsupported dataset type: ${args.datasetType}`,
            },
          ],
        };
    }

    if (!parseResult.success) {
      await ctx.runMutation(internal.importCoordinator.progressImportStage, {
        importRunId: args.importRunId,
        toStage: "failed",
        failureDetails: JSON.stringify({
          stage: "parsing",
          errors: parseResult.errors,
        }),
      });

      return {
        success: false,
        stage: "parsing",
        errors: parseResult.errors,
        warnings: parseResult.warnings,
        failureReason: "Parsing failed",
      };
    }

    // Progress to parsing stage
    await ctx.runMutation(internal.importCoordinator.progressImportStage, {
      importRunId: args.importRunId,
      toStage: "parsing",
      recordCounts: generateRecordCounts({
        [args.datasetType]: parseResult,
      }),
    });

    return {
      success: true,
      stage: "parsing",
      recordCounts: { [args.datasetType]: parseResult.successCount },
      errors: parseResult.errors,
      warnings: parseResult.warnings,
    };
  },
});

/**
 * Public action to parse TPP data
 */
export const parseTppImport = action({
  args: {
    importRunId: v.id("importRuns"),
    datasetType: v.string(),
    rawData: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      {
        importRunId: args.importRunId,
      },
    );

    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    if (importRun.importRun.status !== "started") {
      throw new ConvexError(
        `Import run must be in 'started' status to parse, current: ${importRun.importRun.status}`,
      );
    }

    return ctx.runAction(internal.importCoordinator.parseTppData, {
      importRunId: args.importRunId,
      datasetType: args.datasetType,
      rawData: args.rawData,
      actorId: auth.id,
    });
  },
});

/**
 * ========================================================================
 * VALIDATION STAGE
 * ========================================================================
 */

/**
 * Validate parsed data (internal action)
 */
export const validateParsedData = internalAction({
  args: {
    importRunId: v.id("importRuns"),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const context = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      {
        importRunId: args.importRunId,
      },
    );

    if (!context) {
      return {
        success: false,
        stage: "validating",
        failureReason: "Import run not found",
      };
    }

    const { importRun } = context;

    if (importRun.status !== "parsing") {
      return {
        success: false,
        stage: "validating",
        failureReason: `Invalid stage for validation: ${importRun.status}`,
      };
    }

    // Validate record counts
    const countsValidation = validateRecordCounts(importRun.recordCounts);
    if (!countsValidation.valid) {
      await ctx.runMutation(internal.importCoordinator.progressImportStage, {
        importRunId: args.importRunId,
        toStage: "failed",
        failureDetails: JSON.stringify({
          stage: "validating",
          errors: countsValidation.errors,
        }),
      });

      return {
        success: false,
        stage: "validating",
        errors: countsValidation.errors,
      };
    }

    // Progress to validating stage
    await ctx.runMutation(internal.importCoordinator.progressImportStage, {
      importRunId: args.importRunId,
      toStage: "validating",
    });

    return {
      success: true,
      stage: "validating",
      warnings: countsValidation.errors,
    };
  },
});

/**
 * Public action to validate parsed data
 */
export const validateImport = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<ImportResult> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      {
        importRunId: args.importRunId,
      },
    );

    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    return ctx.runAction(internal.importCoordinator.validateParsedData, {
      importRunId: args.importRunId,
      actorId: auth.id,
    });
  },
});

/**
 * ========================================================================
 * REVIEW STAGE
 * ========================================================================
 */

/**
 * Begin review stage
 */
export const beginReview = mutation({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    if (importRun.status !== "validating") {
      throw new ConvexError(
        `Import run must be in 'validating' status to begin review, current: ${importRun.status}`,
      );
    }

    await ctx.db.patch(args.importRunId, {
      status: "reviewing",
      reviewStartedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Approve review and progress to committing
 */
export const approveReview = mutation({
  args: {
    importRunId: v.id("importRuns"),
    finalRecordCounts: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    if (importRun.status !== "reviewing") {
      throw new ConvexError(
        `Import run must be in 'reviewing' status to approve, current: ${importRun.status}`,
      );
    }

    // Validate final record counts
    const countsValidation = validateRecordCounts(args.finalRecordCounts);
    if (!countsValidation.valid) {
      throw new ConvexError(
        `Invalid record counts: ${countsValidation.errors.map((e) => e.message).join(", ")}`,
      );
    }

    await ctx.db.patch(args.importRunId, {
      status: "committing",
      reviewApprovedAt: Date.now(),
      commitStartedAt: Date.now(),
      recordCounts: args.finalRecordCounts,
      actorId: auth.id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * ========================================================================
 * COMMIT STAGE
 * ========================================================================
 */

/**
 * Commit import data to Capsule entities
 */
export const commitImport = internalAction({
  args: {
    importRunId: v.id("importRuns"),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    const context = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      {
        importRunId: args.importRunId,
      },
    );

    if (!context) {
      return {
        success: false,
        stage: "committing",
        failureReason: "Import run not found",
      };
    }

    const { importRun } = context;

    if (importRun.status !== "committing") {
      return {
        success: false,
        stage: "committing",
        failureReason: `Invalid stage for commit: ${importRun.status}`,
      };
    }

    // TODO: Implement actual commit logic:
    // 1. Create ExternalRecordLink entries for each imported record
    // 2. Insert/update target entity records
    // 3. Handle conflicts and duplicates
    // 4. Track committed records

    // Progress to completed stage
    await ctx.runMutation(internal.importCoordinator.progressImportStage, {
      importRunId: args.importRunId,
      toStage: "completed",
    });

    return {
      success: true,
      stage: "completed",
    };
  },
});

/**
 * Public action to commit import
 */
export const finalizeImport = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<ImportResult> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      {
        importRunId: args.importRunId,
      },
    );

    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    return ctx.runAction(internal.importCoordinator.commitImport, {
      importRunId: args.importRunId,
      actorId: auth.id,
    });
  },
});

/**
 * ========================================================================
 * ERROR HANDLING
 * ========================================================================
 */

/**
 * Mark import run as failed
 */
export const markImportFailed = mutation({
  args: {
    importRunId: v.id("importRuns"),
    failureDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    if (importRun.status === "completed" || importRun.status === "reverted") {
      throw new ConvexError(
        `Cannot mark completed or reverted import as failed`,
      );
    }

    await ctx.db.patch(args.importRunId, {
      status: "failed",
      endTime: Date.now(),
      failureDetails: args.failureDetails,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Revert a completed import
 */
export const revertImport = mutation({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth.role);

    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }

    if (importRun.status !== "completed") {
      throw new ConvexError(
        `Only completed imports can be reverted, current: ${importRun.status}`,
      );
    }

    // TODO: Implement revert logic:
    // 1. Find all ExternalRecordLinks with sourceImportRunId
    // 2. Delete or mark as reverted the linked Capsule entities
    // 3. Mark links as superseded

    await ctx.db.patch(args.importRunId, {
      status: "reverted",
      revertedAt: Date.now(),
      endTime: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
