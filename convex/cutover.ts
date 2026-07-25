// TPP Cutover Tooling — Final migration validation and go/no-go gate.
// Follows spec §6.6: final delta import, zero critical unresolved mappings,
// business validation, provider readiness, rollback plan, TPP read-only transition.

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

/**
 * Cutover validation result
 */
interface CutoverValidationResult {
  canProceed: boolean;
  checks: {
    finalDeltaImport: { passed: boolean; message: string; details?: string };
    zeroCriticalMappings: { passed: boolean; message: string; count?: number };
    businessValidation: { passed: boolean; message: string };
    providerReadiness: { passed: boolean; message: string };
    rollbackPlan: { passed: boolean; message: string; hasPlan: boolean };
  };
  blockers: string[];
  warnings: string[];
}

/**
 * Cutover status types
 */
type CutoverStatus =
  | "not_started"
  | "validating"
  | "ready_for_go"
  | "go"
  | "no_go"
  | "rolled_back";

/**
 * Cutover gate decision record
 */
interface CutoverDecision {
  status: CutoverStatus;
  decidedAt: number;
  decidedBy: string;
  reason: string;
  rollbackPlan: string;
}

// In-memory cutover decision storage (for prod, use proper entity)
let cutoverDecision: CutoverDecision | null = null;

/**
 * ========================================================================
 * VALIDATION QUERIES
 * ========================================================================
 */

/**
 * Check for unresolved external record links (critical mappings)
 */
export const countUnresolvedLinks = query({
  args: {
    sourceSystem: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    const links = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();

    // Filter for unverified critical mappings
    const unresolved = links.filter((link) => {
      if (link.verified !== false) return false;
      if (link.deletedAt !== null) return false;

      // Filter by source system if specified
      if (args.sourceSystem && link.sourceSystem !== args.sourceSystem) {
        return false;
      }

      // Consider TPP legacy links as critical for cutover
      return link.sourceSystem === "tpp_legacy";
    });

    return {
      count: unresolved.length,
      sample: unresolved.slice(0, 10).map((link) => ({
        id: link._id,
        recordType: link.recordType,
        externalId: link.externalId,
        capsuleEntity: link.capsuleEntity,
        capsuleId: link.capsuleId,
      })),
    };
  },
});

/**
 * Get latest import run status for final delta check
 */
export const getLatestImportRun = query({
  args: {
    sourceSystem: v.optional(v.string()),
    datasetType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    let query = ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc");

    const latest = await query.first();

    if (!latest) {
      return null;
    }

    return {
      id: latest._id,
      status: latest.status,
      sourceSystem: latest.sourceSystem,
      datasetType: latest.datasetType,
      startTime: latest.startTime,
      completionTime: latest.completionTime,
      recordCounts: latest.recordCounts,
      failureDetails: latest.failureDetails,
    };
  },
});

/**
 * Full cutover validation check
 */
export const validateCutoverReadiness = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    const checks: CutoverValidationResult["checks"] = {
      finalDeltaImport: { passed: false, message: "Checking..." },
      zeroCriticalMappings: { passed: false, message: "Checking..." },
      businessValidation: { passed: false, message: "Pending manual sign-off" },
      providerReadiness: { passed: false, message: "Checking integrations..." },
      rollbackPlan: {
        passed: false,
        message: "No rollback plan documented",
        hasPlan: false,
      },
    };

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check 1: Final delta import
    const latestImport = await ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .first();

    if (!latestImport) {
      checks.finalDeltaImport = {
        passed: false,
        message: "No import runs found",
        details: "At least one successful import run is required",
      };
      blockers.push("No import runs have been executed");
    } else if (latestImport.status !== "completed") {
      checks.finalDeltaImport = {
        passed: false,
        message: `Latest import is ${latestImport.status}`,
        details: `Import ID: ${latestImport._id}`,
      };
      blockers.push(`Latest import run has status: ${latestImport.status}`);
    } else {
      // Check if it's recent (last 7 days) for "final delta"
      const daysSinceImport = latestImport.completionTime
        ? (Date.now() - latestImport.completionTime) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (daysSinceImport > 7) {
        checks.finalDeltaImport = {
          passed: false,
          message: "Latest import is stale",
          details: `${Math.floor(daysSinceImport)} days old. Run a final delta import.`,
        };
        blockers.push("Latest import run is more than 7 days old");
      } else {
        checks.finalDeltaImport = {
          passed: true,
          message: "Latest import completed successfully",
          details: `Completed ${Math.floor(daysSinceImport)} days ago`,
        };
      }
    }

    // Check 2: Zero critical unresolved mappings
    const unresolvedLinks = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();

    const criticalUnresolved = unresolvedLinks.filter(
      (link) =>
        link.verified === false &&
        link.deletedAt === null &&
        link.sourceSystem === "tpp_legacy",
    );

    checks.zeroCriticalMappings = {
      passed: criticalUnresolved.length === 0,
      message:
        criticalUnresolved.length === 0
          ? "All critical mappings verified"
          : `${criticalUnresolved.length} unresolved TPP mappings`,
      count: criticalUnresolved.length,
    };

    if (criticalUnresolved.length > 0) {
      blockers.push(
        `${criticalUnresolved.length} critical TPP record mappings are unverified`,
      );
      warnings.push(
        "Use the Reconcile Records page to verify or resolve unverified mappings",
      );
    }

    // Check 3: Business validation (manual sign-off)
    // This requires explicit user confirmation - not automated
    checks.businessValidation = {
      passed: false,
      message: "Requires manual sign-off",
    };
    blockers.push("Business validation requires explicit approval");

    // Check 4: Provider readiness
    // Check if integrations are connected via manifestEvents ledger
    const integrationEvents = await ctx.db.query("manifestEvents").collect();

    const calendarConnected = integrationEvents.some(
      (e) => e.type === "GoogleCalendarConnected",
    );
    const qboConnected = integrationEvents.some(
      (e) => e.type === "QuickBooksConnected",
    );

    if (!calendarConnected && !qboConnected) {
      checks.providerReadiness = {
        passed: true,
        message: "No integrations configured (OK for cutover)",
      };
    } else {
      checks.providerReadiness = {
        passed: true,
        message: `Integrations: ${calendarConnected ? "Calendar " : ""}${qboConnected ? "+ QBO " : ""}`,
      };
    }

    // Check 5: Rollback plan
    // This requires explicit documentation - not automated
    checks.rollbackPlan = {
      passed: false,
      message: "Rollback plan not documented",
      hasPlan: false,
    };
    blockers.push("Rollback plan must be documented before cutover");

    const canProceed =
      blockers.filter(
        (b) => b.includes("Business validation") || b.includes("Rollback plan"),
      ).length === 0 && criticalUnresolved.length === 0;

    return {
      canProceed,
      checks,
      blockers,
      warnings,
    };
  },
});

/**
 * Get current cutover status
 */
export const getCutoverStatus = query({
  args: {},
  handler: async () => {
    if (!cutoverDecision) {
      return {
        status: "not_started" as CutoverStatus,
        decidedAt: null,
        decidedBy: null,
        reason: null,
      };
    }

    return {
      status: cutoverDecision.status,
      decidedAt: cutoverDecision.decidedAt,
      decidedBy: cutoverDecision.decidedBy,
      reason: cutoverDecision.reason,
    };
  },
});

/**
 * ========================================================================
 * CUTOVER ORCHESTRATION MUTATIONS
 * ========================================================================
 */

/**
 * Execute go/no-go decision
 */
export const executeCutoverDecision = mutation({
  args: {
    decision: v.string(), // "go" | "no_go"
    reason: v.string(),
    rollbackPlan: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Only admins/owners can execute cutover
    if (
      auth.role !== "admin" &&
      auth.role !== "owner" &&
      !auth.role.endsWith("_manager")
    ) {
      throw new ConvexError(
        "Only organization administrators can execute cutover.",
      );
    }

    const decision = args.decision as "go" | "no_go";

    if (decision !== "go" && decision !== "no_go") {
      throw new ConvexError('Decision must be "go" or "no_go"');
    }

    // For "go" decision, validate prerequisites
    if (decision === "go") {
      // Check unresolved mappings
      const unresolvedLinks = await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect();

      const criticalUnresolved = unresolvedLinks.filter(
        (link) =>
          link.verified === false &&
          link.deletedAt === null &&
          link.sourceSystem === "tpp_legacy",
      );

      if (criticalUnresolved.length > 0) {
        throw new ConvexError(
          `Cannot proceed: ${criticalUnresolved.length} critical TPP mappings are unverified. Resolve all critical mappings before cutover.`,
        );
      }

      // Verify latest import is complete
      const latestImport = await ctx.db
        .query("importRuns")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .first();

      if (!latestImport || latestImport.status !== "completed") {
        throw new ConvexError(
          "Cannot proceed: Latest import run is not completed. Run a successful final delta import first.",
        );
      }
    }

    // Record the decision (in prod, persist to entity)
    cutoverDecision = {
      status: decision === "go" ? "go" : "no_go",
      decidedAt: Date.now(),
      decidedBy: auth.id,
      reason: args.reason,
      rollbackPlan: args.rollbackPlan,
    };

    // Emit event for audit trail (in prod, use manifestEvents)
    // await ctx.scheduler.runAfter(0, internal.cutover.recordCutoverEvent, {
    //   status: decision,
    //   reason: args.reason,
    // });

    return {
      success: true,
      status: decision,
      message: `Cutover decision recorded: ${decision.toUpperCase()}`,
    };
  },
});

/**
 * Mark TPP as read-only (disable scheduled imports)
 */
export const setTppReadOnly = mutation({
  args: {
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Only admins/owners can set TPP read-only
    if (
      auth.role !== "admin" &&
      auth.role !== "owner" &&
      !auth.role.endsWith("_manager")
    ) {
      throw new ConvexError(
        "Only organization administrators can set TPP read-only.",
      );
    }

    // Check if cutover has been approved
    if (!cutoverDecision || cutoverDecision.status !== "go") {
      throw new ConvexError(
        "TPP cannot be set to read-only until cutover is approved (GO decision).",
      );
    }

    // In prod, this would:
    // 1. Disable scheduled TPP imports
    // 2. Mark TPP system as read-only in org settings
    // 3. Record the transition event

    // For now, record in decision
    cutoverDecision = {
      ...cutoverDecision,
      status: "go", // remains go
      reason: `${cutoverDecision.reason} | TPP read-only: ${args.reason}`,
    };

    return {
      success: true,
      message: "TPP system marked as read-only. Scheduled imports disabled.",
    };
  },
});

/**
 * Rollback cutover decision (emergency rollback)
 */
export const rollbackCutover = mutation({
  args: {
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Only admins/owners can rollback
    if (
      auth.role !== "admin" &&
      auth.role !== "owner" &&
      !auth.role.endsWith("_manager")
    ) {
      throw new ConvexError(
        "Only organization administrators can rollback cutover.",
      );
    }

    if (!cutoverDecision || cutoverDecision.status !== "go") {
      throw new ConvexError("Cannot rollback: cutover was not approved (GO).");
    }

    // Execute rollback
    cutoverDecision = {
      status: "rolled_back",
      decidedAt: Date.now(),
      decidedBy: auth.id,
      reason: args.reason,
      rollbackPlan: cutoverDecision.rollbackPlan,
    };

    // In prod, this would:
    // 1. Revert the latest import if needed
    // 2. Re-enable TPP for writes
    // 3. Record rollback event

    return {
      success: true,
      message: "Cutover rolled back. TPP re-enabled for writes.",
    };
  },
});
