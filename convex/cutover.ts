// TPP Cutover Tooling — Final migration validation and go/no-go gate.
// Follows spec §6.6: final delta import, zero critical unresolved mappings,
// business validation, provider readiness, rollback plan, TPP read-only
// transition; BE-16.4 adds opening stock, financial mode and backup evidence.
// Every check lives in convex/lib/cutoverGate.ts: the page's checklist and
// the go step read the same answer.

import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import {
  cutoverDecisionOf,
  evaluateCutoverGate,
  isOpenTppLink,
  type CutoverGate,
} from "./lib/cutoverGate";
import { canRead } from "./search";

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

const MANAGERS_ONLY = "Only managers can see this check";

/** Scheduled TPP imports Capsule runs (convex/crons.ts holds none today). */
const SCHEDULED_TPP_IMPORTS: string[] = [];

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
    // Same outcome as the ExternalRecordLink read policy (importAccess).
    if (!canRead(auth, ["importAccess"])) return { count: 0, sample: [] };

    const links = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();

    // The TPP items still waiting for a person: the same set the switch
    // check and the match-up page count.
    const unresolved = links.filter(
      (link) =>
        isOpenTppLink(link) &&
        (!args.sourceSystem || link.sourceSystem === args.sourceSystem),
    );

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
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Same outcome as the ImportRun read policy (importAccess): no access
    // reads nothing, removed runs are left out.
    if (!canRead(auth, ["importAccess"])) return null;

    let latest = null;
    for await (const run of ctx.db
      .query("importRuns")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")) {
      if (run.deletedAt == null) {
        latest = run;
        break;
      }
    }

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
  handler: async (ctx): Promise<CutoverGate> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // The checks read import runs, import matches (importAccess) and
    // outside-service connections (manageAccess); a caller who may not read
    // them sees no details and cannot proceed.
    const mayRead =
      canRead(auth, ["importAccess"]) && canRead(auth, ["manageAccess"]);
    if (!mayRead) {
      const hidden = { passed: false, message: MANAGERS_ONLY };
      return {
        canProceed: false,
        checks: {
          finalDeltaImport: hidden,
          zeroCriticalMappings: hidden,
          businessValidation: hidden,
          providerReadiness: hidden,
          rollbackPlan: { ...hidden, hasPlan: false },
          openingStock: hidden,
          financialMode: hidden,
          backup: hidden,
        },
        blockers: ["Only managers can see the switch checks"],
        warnings: [],
        openItems: [],
        finalImportRunIds: {},
      };
    }

    return await evaluateCutoverGate(ctx.db, tenantId);
  },
});

/**
 * Get current cutover status (AUTHENTICATED, TENANT-ISOLATED)
 */
export const getCutoverStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Fetch tenant-scoped cutover decision
    const decision = await cutoverDecisionOf(ctx.db, tenantId);

    if (!decision) {
      return {
        status: "not_started" as CutoverStatus,
        decidedAt: null,
        decidedBy: null,
        reason: null,
        rollbackPlan: null,
        businessApproved: false,
        businessApprovedById: null,
        businessApprovedAt: null,
        businessEvidence: null,
        sourceFrozenAt: null,
        openingStockAsOf: null,
        openingStockCount: null,
        financialMode: null,
        backupEvidence: null,
        tppReadOnlyAt: null,
        scheduledImportsDisabledAt: null,
        scheduledImportsNote: null,
      };
    }

    return {
      status: decision.status as CutoverStatus,
      decidedAt: decision.decidedAt,
      decidedBy: decision.decidedBy,
      reason: decision.reason,
      rollbackPlan: decision.rollbackPlan,
      businessApproved: decision.businessApproved ?? false,
      businessApprovedById: decision.businessApprovedById ?? null,
      businessApprovedAt: decision.businessApprovedAt ?? null,
      businessEvidence: decision.businessEvidence ?? null,
      sourceFrozenAt: decision.sourceFrozenAt ?? null,
      openingStockAsOf: decision.openingStockAsOf ?? null,
      openingStockCount: decision.openingStockCount ?? null,
      financialMode: decision.financialMode ?? null,
      backupEvidence: decision.backupEvidence ?? null,
      tppReadOnlyAt: decision.tppReadOnlyAt ?? null,
      scheduledImportsDisabledAt: decision.scheduledImportsDisabledAt ?? null,
      scheduledImportsNote: decision.scheduledImportsNote ?? null,
    };
  },
});

/**
 * ========================================================================
 * CUTOVER ORCHESTRATION MUTATIONS
 * ========================================================================
 * These are wrapper mutations that handle the full cutover workflow.
 * They mirror the CutoverDecision commands in
 * src/admin/cutover-decision.manifest and leave the same event rows.
 * ========================================================================
 */

async function requireAdmin(ctx: MutationCtx, refusal: string) {
  const auth = await getAuthContext(ctx);
  const tenantId = requireTenant(auth);
  if (auth.role !== "admin" && auth.role !== "owner") {
    throw new ConvexError(refusal);
  }
  return { auth, tenantId };
}

/**
 * Find or create cutover decision for tenant
 */
async function findOrCreateCutoverDecision(
  ctx: MutationCtx,
  tenantId: string,
  actorId: string,
): Promise<Id<"cutoverDecisions">> {
  const existing = await cutoverDecisionOf(ctx.db, tenantId);
  if (existing) return existing._id;

  // Mutations cannot call the generated create step, so the row is written
  // here with the same starting values and the same event row.
  const now = Date.now();
  const id = await ctx.db.insert("cutoverDecisions", {
    tenantId,
    status: "not_started",
    decidedAt: now,
    decidedBy: actorId,
    reason: "Cutover initialized",
    rollbackPlan: "",
    businessApproved: false,
  });
  await stepEvent(ctx, "CutoverDecisionCreated", id, tenantId, now);
  return id;
}

async function stepEvent(
  ctx: MutationCtx,
  type: string,
  id: Id<"cutoverDecisions">,
  tenantId: string,
  createdAt: number,
) {
  await insertStepEvent(ctx, {
    type,
    entity: "CutoverDecision",
    entityId: String(id),
    payload: { cutoverDecisionId: String(id), tenantId },
    createdAt,
  });
}

/**
 * Record business approval and rollback plan (pre-requisite for GO decision)
 * This is a wrapper that creates the decision if it doesn't exist
 */
export const recordCutoverApprovals = mutation({
  args: {
    businessApproved: v.boolean(),
    rollbackPlan: v.string(),
    // What the manager checked (events walked through, reports compared).
    businessEvidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth, tenantId } = await requireAdmin(
      ctx,
      "Only admins can save the switch sign-off.",
    );
    const evidence = (args.businessEvidence ?? "").trim();
    if (args.businessApproved && evidence.length === 0) {
      throw new ConvexError(
        "Say what you checked before you sign off (for example the events and reports you walked through).",
      );
    }

    const docId = await findOrCreateCutoverDecision(ctx, tenantId, auth.id);
    const now = Date.now();
    await ctx.db.patch(docId, {
      businessApproved: args.businessApproved,
      businessApprovedById: args.businessApproved ? auth.id : null,
      businessApprovedAt: args.businessApproved ? now : null,
      businessEvidence: evidence.length > 0 ? evidence : null,
      rollbackPlan: args.rollbackPlan,
      decidedAt: now,
      decidedBy: auth.id,
    });
    await stepEvent(
      ctx,
      "CutoverDecisionApprovalsRecorded",
      docId,
      tenantId,
      now,
    );

    return {
      success: true,
      message: "Switch sign-off saved",
    };
  },
});

/**
 * The facts the switch rests on besides the sign-off: when TPP stopped
 * taking entries, the confirmed opening stock date, how old money records
 * come over, and where the backup is. Each argument left out keeps its
 * saved value.
 */
export const saveCutoverFacts = mutation({
  args: {
    sourceFrozenAt: v.optional(v.number()),
    openingStockAsOf: v.optional(v.number()),
    financialMode: v.optional(
      v.union(
        v.literal("reference_history"),
        v.literal("ledger_reconstruction"),
      ),
    ),
    backupEvidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { auth, tenantId } = await requireAdmin(
      ctx,
      "Only admins can save the switch facts.",
    );
    const docId = await findOrCreateCutoverDecision(ctx, tenantId, auth.id);
    const patch: Record<string, unknown> = {};
    if (args.sourceFrozenAt !== undefined) {
      patch.sourceFrozenAt = args.sourceFrozenAt;
    }
    if (args.openingStockAsOf !== undefined) {
      // The confirmed count is the opening stock lines already put on the
      // shelves at the moment of confirming.
      const applied = (
        await ctx.db
          .query("openingStockRecords")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      ).filter((row) => row.deletedAt == null && row.status === "applied");
      patch.openingStockAsOf = args.openingStockAsOf;
      patch.openingStockCount = applied.length;
      patch.openingStockConfirmedById = auth.id;
    }
    if (args.financialMode !== undefined) {
      patch.financialMode = args.financialMode;
    }
    if (args.backupEvidence !== undefined) {
      const text = args.backupEvidence.trim();
      patch.backupEvidence = text.length > 0 ? text : null;
    }
    await ctx.db.patch(docId, patch);
    await stepEvent(
      ctx,
      "CutoverDecisionApprovalsRecorded",
      docId,
      tenantId,
      Date.now(),
    );
    return { success: true, message: "Switch facts saved" };
  },
});

/**
 * Execute go/no-go decision (ATOMIC VALIDATION)
 * Go runs the same checks the page shows and refuses with every open one.
 */
export const executeCutoverDecision = mutation({
  args: {
    decision: v.string(), // "go" | "no_go"
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, tenantId } = await requireAdmin(
      ctx,
      "Only admins can approve or stop this switch.",
    );

    const cutoverDecision = args.decision as "go" | "no_go";
    if (cutoverDecision !== "go" && cutoverDecision !== "no_go") {
      throw new ConvexError('Decision must be "go" or "no_go"');
    }

    const docId = await findOrCreateCutoverDecision(ctx, tenantId, auth.id);
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: cutoverDecision,
      reason: args.reason,
      decidedAt: now,
      decidedBy: auth.id,
    };

    if (cutoverDecision === "go") {
      const gate = await evaluateCutoverGate(ctx.db, tenantId);
      if (!gate.canProceed) {
        throw new ConvexError(
          `Can't switch yet: ${gate.blockers.join(". ")}. Fix these, or choose Don't switch yet.`,
        );
      }
      // The import runs this decision rests on, and the record that
      // scheduled TPP imports are off from here on (AC-292).
      patch.finalImportRuns = JSON.stringify(gate.finalImportRunIds);
      patch.scheduledImportsDisabledAt = now;
      patch.scheduledImportsNote =
        SCHEDULED_TPP_IMPORTS.length === 0
          ? "No scheduled TPP imports were set up; none run after the switch. TPP files can still be imported by hand for the archive."
          : `Turned off: ${SCHEDULED_TPP_IMPORTS.join(", ")}`;
    }

    await ctx.db.patch(docId, patch);
    await stepEvent(ctx, "CutoverDecisionExecuted", docId, tenantId, now);

    return {
      success: true,
      status: cutoverDecision,
      message: `Switch decision saved: ${cutoverDecision.toUpperCase()}`,
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
  handler: async (ctx) => {
    const { tenantId } = await requireAdmin(
      ctx,
      "Only admins can set TPP to read-only.",
    );

    const decision = await cutoverDecisionOf(ctx.db, tenantId);
    if (!decision) {
      throw new ConvexError(
        "No switch decision is on file yet. Start the switch checks first.",
      );
    }
    if (decision.status !== "go") {
      throw new ConvexError(
        "TPP can be set to read-only only after the switch is approved.",
      );
    }

    const now = Date.now();
    await ctx.db.patch(decision._id, { tppReadOnlyAt: now });
    await stepEvent(
      ctx,
      "CutoverDecisionTppReadOnlySet",
      decision._id,
      tenantId,
      now,
    );

    return {
      success: true,
      message: "TPP is now read-only. Scheduled imports are off.",
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
    const { auth, tenantId } = await requireAdmin(
      ctx,
      "Only admins can undo the switch.",
    );

    const decision = await cutoverDecisionOf(ctx.db, tenantId);
    if (!decision) {
      throw new ConvexError("No switch decision is on file. Nothing to undo.");
    }
    if (decision.status !== "go") {
      throw new ConvexError("Can't undo: the switch was not approved.");
    }

    // Undoing the switch turns TPP writes back on, so the read-only stamp
    // goes with it.
    const now = Date.now();
    await ctx.db.patch(decision._id, {
      status: "rolled_back" as const,
      reason: args.reason,
      decidedAt: now,
      decidedBy: auth.id,
      tppReadOnlyAt: null,
    });
    await stepEvent(
      ctx,
      "CutoverDecisionRolledBack",
      decision._id,
      tenantId,
      now,
    );

    return {
      success: true,
      message: "Switch undone. TPP writes are back on.",
    };
  },
});
