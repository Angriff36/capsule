// TPP Cutover Tooling — Final migration validation and go/no-go gate.
// Follows spec §6.6: final delta import, zero critical unresolved mappings,
// business validation, provider readiness, rollback plan, TPP read-only transition.

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
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
 * Tenant-scoped provider readiness for the cutover gate (spec §6.6, issue
 * #386). Derived ONLY from the evidence of the calling tenant: canonical
 * `integrationConnections` rows (a tenant-scoped table) and the
 * manifestEvents connect/disconnect/reconcile rows whose entityId is this
 * tenant (the Calendar and QBO connection ledger). Latest event wins: a
 * historic connect never overrules a later disconnect or revocation, and
 * sync evidence belongs to the CURRENT engagement only — a reconcile
 * qualifies only when it happened at or after the latest connect and
 * carries that connection's id whenever both payloads identify one, so the
 * clean sync of a previous engagement never rides a reconnect. A provider
 * the tenant never engaged is unneeded and cannot block cutover.
 */
interface ProviderReadiness {
  passed: boolean;
  message: string;
  blockers: string[];
  warnings: string[];
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  quickbooks: "QuickBooks",
  google_calendar: "Calendar",
  email: "Email",
  sms: "SMS",
  nowsta: "Nowsta",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** Providers whose connection state lives in the manifestEvents ledger. */
const LEDGER_PROVIDERS: Array<{
  provider: string;
  entity: string;
  connectedType: string;
  disconnectedType: string;
  reconciledType: string;
}> = [
  {
    provider: "google_calendar",
    entity: "GoogleCalendarConnection",
    connectedType: "GoogleCalendarConnected",
    disconnectedType: "GoogleCalendarDisconnected",
    reconciledType: "GoogleCalendarReconciled",
  },
  {
    provider: "quickbooks",
    entity: "QuickBooksConnection",
    connectedType: "QuickBooksConnected",
    disconnectedType: "QuickBooksDisconnected",
    reconciledType: "QuickBooksReconciled",
  },
];

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload != null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function payloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function payloadText(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function evaluateProviderReadiness(
  db: QueryCtx["db"],
  tenantId: string,
): Promise<ProviderReadiness> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];

  // Canonical connections of this tenant only; freshest row per provider.
  const canonicalRows = await db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const canonicalByProvider = new Map<string, Doc<"integrationConnections">>();
  for (const row of canonicalRows) {
    if (row.deletedAt != null) continue;
    const current = canonicalByProvider.get(row.provider);
    const rowTime = row.updatedAt ?? row._creationTime;
    const currentTime = current
      ? (current.updatedAt ?? current._creationTime)
      : -1;
    if (!current || rowTime > currentTime) {
      canonicalByProvider.set(row.provider, row);
    }
  }

  // The ledger rows of this tenant only: entityId is the tenant id for
  // connection lifecycle and reconcile events, so rows of any other tenant
  // can never appear here.
  const ledgerRows = await db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", tenantId))
    .collect();

  const ledgerByProvider = new Map<
    string,
    {
      engaged: boolean;
      connected: boolean;
      lastReconcile: {
        at: number;
        failed: number | null;
        error: string | null;
      } | null;
    }
  >();
  for (const spec of LEDGER_PROVIDERS) {
    const rows = ledgerRows.filter((row) => row.entity === spec.entity);

    // Latest lifecycle event decides engagement: a historic connect never
    // overrules a later disconnect or revocation.
    const lifecycle = rows
      .filter(
        (row) =>
          row.type === spec.connectedType || row.type === spec.disconnectedType,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];
    const connect = lifecycle?.type === spec.connectedType ? lifecycle : null;
    const connectConnectionId = connect
      ? payloadText(payloadRecord(connect.payload) ?? {}, "connectionId")
      : null;

    // Sync evidence belongs to the current engagement only: a reconcile
    // qualifies when it happened at or after the latest connect AND carries
    // that connection's id whenever both payloads identify one. The clean
    // sync of a previous engagement therefore never qualifies a reconnect.
    const reconcile = connect
      ? rows
          .filter(
            (row) =>
              row.type === spec.reconciledType &&
              row.createdAt >= connect.createdAt,
          )
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((row) => {
            const reconcileConnectionId = payloadText(
              payloadRecord(row.payload) ?? {},
              "connectionId",
            );
            return (
              connectConnectionId == null ||
              reconcileConnectionId == null ||
              reconcileConnectionId === connectConnectionId
            );
          })
      : undefined;

    const reconcilePayload = reconcile
      ? payloadRecord(reconcile.payload)
      : null;
    ledgerByProvider.set(spec.provider, {
      engaged: lifecycle != null,
      connected: connect != null,
      lastReconcile: reconcile
        ? {
            at: reconcile.createdAt,
            failed: reconcilePayload
              ? payloadNumber(reconcilePayload, "failed")
              : null,
            error: reconcilePayload
              ? payloadText(reconcilePayload, "error")
              : null,
          }
        : null,
    });
  }

  const providers = new Set<string>([
    ...canonicalByProvider.keys(),
    ...ledgerByProvider.keys(),
  ]);
  for (const provider of providers) {
    const label = PROVIDER_LABELS[provider] ?? provider;
    const canonical = canonicalByProvider.get(provider);
    const ledger = ledgerByProvider.get(provider) ?? null;
    if (canonical == null && ledger?.engaged !== true) continue;

    const connected =
      canonical != null
        ? canonical.status === "connected"
        : (ledger?.connected ?? false);

    if (!connected) {
      const state = canonical ? canonical.status : "disconnected";
      blockers.push(
        `${label} is ${state} but this workspace has used it. Reconnect it or remove it fully before cutover.`,
      );
      lines.push(`${label}: ${state}`);
      continue;
    }

    // Connected: the current engagement must hold healthy sync evidence —
    // connecting alone never substitutes for a successful sync on THIS
    // connection.
    if (ledger != null) {
      if (ledger.lastReconcile == null) {
        blockers.push(
          `${label} is connected but no sync has completed since it was connected. Run a sync before cutover.`,
        );
        lines.push(`${label}: connected, never synced on this connection`);
        continue;
      }
      const failed = ledger.lastReconcile.failed ?? 0;
      if (failed > 0 || ledger.lastReconcile.error != null) {
        blockers.push(
          failed > 0
            ? `${label} is connected but its latest sync failed (${failed} item(s)). Sync clean before cutover.`
            : `${label} is connected but its latest sync reported an error: ${ledger.lastReconcile.error}.`,
        );
        lines.push(`${label}: sync failed`);
        continue;
      }
    }
    if (
      canonical != null &&
      canonical.lastErrorAt != null &&
      (canonical.lastSuccessfulSyncAt == null ||
        canonical.lastErrorAt > canonical.lastSuccessfulSyncAt)
    ) {
      blockers.push(
        `${label} is connected but its latest sync failed: ${canonical.lastErrorMessage ?? "unknown error"}.`,
      );
      lines.push(`${label}: sync failed`);
      continue;
    }
    if (
      provider === "stripe" &&
      canonical != null &&
      !(canonical.chargesEnabled && canonical.payoutsEnabled)
    ) {
      blockers.push(
        `${label} is connected but cannot accept charges and payouts yet. Finish Stripe onboarding before cutover.`,
      );
      lines.push(`${label}: not payout-ready`);
      continue;
    }
    lines.push(`${label}: connected`);
  }

  const message =
    blockers.length > 0
      ? `Provider readiness needs attention: ${blockers.join(" ")}`
      : lines.length > 0
        ? `Integrations: ${lines.join("; ")}`
        : "No integrations in use (OK for cutover)";

  return { passed: blockers.length === 0, message, blockers, warnings };
}

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
    // Check if persisted decision has business approval
    const cutoverDecision = await ctx.db
      .query("cutoverDecisions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .first();

    const hasBusinessApproval = cutoverDecision?.businessApproved === true;

    checks.businessValidation = {
      passed: hasBusinessApproval,
      message: hasBusinessApproval
        ? "Business sign-off confirmed"
        : "Requires manual sign-off",
    };

    if (!hasBusinessApproval) {
      blockers.push("Business validation requires explicit approval");
    }

    // Check 4: Provider readiness (TENANT-ISOLATED)
    // Derived from the canonical connections and sync evidence of THIS
    // tenant only (issue #386): connect events of another tenant cannot
    // pass or fail this tenant, an engaged provider that is disconnected,
    // revoked, erroring, or failing to sync stays unresolved, sync evidence
    // must belong to the current connection, and providers this workspace
    // never engaged do not block cutover.
    const providers = await evaluateProviderReadiness(ctx.db, tenantId);
    checks.providerReadiness = {
      passed: providers.passed,
      message: providers.message,
    };
    for (const providerBlocker of providers.blockers) {
      blockers.push(providerBlocker);
    }
    for (const providerWarning of providers.warnings) {
      warnings.push(providerWarning);
    }

    // Check 5: Rollback plan
    // Check if persisted decision has a rollback plan
    const hasRollbackPlan =
      cutoverDecision?.rollbackPlan != null &&
      cutoverDecision.rollbackPlan.length > 0;

    checks.rollbackPlan = {
      passed: hasRollbackPlan,
      message: hasRollbackPlan
        ? "Rollback plan documented"
        : "Rollback plan not documented",
      hasPlan: hasRollbackPlan,
    };

    if (!hasRollbackPlan) {
      blockers.push("Rollback plan must be documented before cutover");
    }

    const canProceed = blockers.length === 0 && criticalUnresolved.length === 0;

    return {
      canProceed,
      checks,
      blockers,
      warnings,
    };
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
    const decision = await ctx.db
      .query("cutoverDecisions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .first();

    if (!decision) {
      return {
        status: "not_started" as CutoverStatus,
        decidedAt: null,
        decidedBy: null,
        reason: null,
        rollbackPlan: null,
        businessApproved: false,
        tppReadOnlyAt: null,
      };
    }

    return {
      status: decision.status as CutoverStatus,
      decidedAt: decision.decidedAt,
      decidedBy: decision.decidedBy,
      reason: decision.reason,
      rollbackPlan: decision.rollbackPlan,
      businessApproved: decision.businessApproved ?? false,
      tppReadOnlyAt: decision.tppReadOnlyAt ?? null,
    };
  },
});

/**
 * ========================================================================
 * CUTOVER ORCHESTRATION MUTATIONS
 * ========================================================================
 * These are wrapper mutations that handle the full cutover workflow.
 * They use the generated CutoverDecision commands internally.
 * ========================================================================
 */

/**
 * Find or create cutover decision for tenant
 */
async function findOrCreateCutoverDecision(
  ctx: any,
  tenantId: string,
): Promise<Id<"cutoverDecisions">> {
  const existing = await ctx.db
    .query("cutoverDecisions")
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
    .first();

  if (existing) {
    return existing._id;
  }

  // Create new cutover decision using the generated mutation
  // Note: We can't call mutations from within mutations, so we insert directly
  // This is safe because we're in a controlled admin-only context
  return await ctx.db.insert("cutoverDecisions", {
    tenantId,
    status: "not_started",
    decidedAt: Date.now(),
    decidedBy: (await getAuthContext(ctx)).id,
    reason: "Cutover initialized",
    rollbackPlan: "",
    businessApproved: false,
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
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Restrict to admin/owner only
    if (auth.role !== "admin" && auth.role !== "owner") {
      throw new ConvexError(
        "Only organization administrators can record cutover approvals.",
      );
    }

    const docId = await findOrCreateCutoverDecision(ctx, tenantId);

    // Inline the logic from CutoverDecision_recordApprovals
    const doc = await ctx.db.get(docId);
    if (!doc) throw new ConvexError("CutoverDecision not found");
    const updates = {
      businessApproved: args.businessApproved,
      rollbackPlan: args.rollbackPlan,
      decidedAt: Date.now(),
      decidedBy: auth.id,
    };
    await ctx.db.patch(docId, updates);

    return {
      success: true,
      message: "Cutover approvals recorded",
    };
  },
});

/**
 * Execute go/no-go decision (ATOMIC VALIDATION)
 * This wrapper performs all validation before calling the generated command
 */
export const executeCutoverDecision = mutation({
  args: {
    decision: v.string(), // "go" | "no_go"
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);

    // Restrict to admin/owner only
    if (auth.role !== "admin" && auth.role !== "owner") {
      throw new ConvexError(
        "Only organization administrators can execute cutover.",
      );
    }

    const cutoverDecision = args.decision as "go" | "no_go";

    if (cutoverDecision !== "go" && cutoverDecision !== "no_go") {
      throw new ConvexError('Decision must be "go" or "no_go"');
    }

    // Find or create cutover decision
    const docId = await findOrCreateCutoverDecision(ctx, tenantId);

    // ATOMIC VALIDATION FOR GO DECISION
    if (cutoverDecision === "go") {
      // Fetch current decision state
      const currentDecision = await ctx.db.get(docId);

      // Validate business approval
      if (!currentDecision?.businessApproved) {
        throw new ConvexError(
          "Cannot proceed: Business validation requires explicit approval. Use recordCutoverApprovals first.",
        );
      }

      // Validate rollback plan
      if (
        !currentDecision?.rollbackPlan ||
        currentDecision.rollbackPlan.length === 0
      ) {
        throw new ConvexError(
          "Cannot proceed: Rollback plan must be documented. Use recordCutoverApprovals first.",
        );
      }

      // Validate zero critical unresolved mappings
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

      // Verify latest import is complete and recent
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

      const daysSinceImport = latestImport.completionTime
        ? (Date.now() - latestImport.completionTime) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (daysSinceImport > 7) {
        throw new ConvexError(
          `Cannot proceed: Latest import run is stale (${Math.floor(daysSinceImport)} days old). Run a final delta import first.`,
        );
      }

      // Provider readiness uses the same tenant-scoped evidence as the
      // readiness check (issue #386): a GO decision cannot land while an
      // engaged provider is disconnected, revoked, or failing, and a
      // connection without a successful sync of its own does not count.
      const providers = await evaluateProviderReadiness(ctx.db, tenantId);
      if (!providers.passed) {
        throw new ConvexError(
          `Cannot proceed: ${providers.blockers.join(" ")} Resolve provider readiness, or record NO-GO.`,
        );
      }
    }

    // Inline the logic from CutoverDecision_execute
    const executeDecision = args.decision as "go" | "no_go";
    const executeDoc = await ctx.db.get(docId);
    if (!executeDoc) throw new ConvexError("CutoverDecision not found");

    const executeUpdates = {
      status: executeDecision,
      reason: args.reason,
      decidedAt: Date.now(),
      decidedBy: auth.id,
    };
    await ctx.db.patch(docId, executeUpdates);

    return {
      success: true,
      status: executeDecision,
      message: `Cutover decision recorded: ${executeDecision.toUpperCase()}`,
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

    // Restrict to admin/owner only
    if (auth.role !== "admin" && auth.role !== "owner") {
      throw new ConvexError(
        "Only organization administrators can set TPP read-only.",
      );
    }

    // Find existing cutover decision
    const decision = await ctx.db
      .query("cutoverDecisions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .first();

    if (!decision) {
      throw new ConvexError(
        "Cutover decision not found. Initialize cutover first.",
      );
    }

    if (decision.status !== "go") {
      throw new ConvexError(
        "TPP cannot be set to read-only until cutover is approved (GO decision).",
      );
    }

    // Inline the logic from CutoverDecision_setTppReadOnly
    const readOnlyUpdates = {
      tppReadOnlyAt: Date.now(),
    };
    await ctx.db.patch(decision._id, readOnlyUpdates);

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

    // Restrict to admin/owner only
    if (auth.role !== "admin" && auth.role !== "owner") {
      throw new ConvexError(
        "Only organization administrators can rollback cutover.",
      );
    }

    // Find existing cutover decision
    const decision = await ctx.db
      .query("cutoverDecisions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .first();

    if (!decision) {
      throw new ConvexError("Cutover decision not found. Cannot rollback.");
    }

    if (decision.status !== "go") {
      throw new ConvexError("Cannot rollback: cutover was not approved (GO).");
    }

    // Inline the logic from CutoverDecision_rollback
    const rollbackUpdates = {
      status: "rolled_back" as const,
      reason: args.reason,
      decidedAt: Date.now(),
      decidedBy: auth.id,
    };
    await ctx.db.patch(decision._id, rollbackUpdates);

    return {
      success: true,
      message: "Cutover rolled back. TPP re-enabled for writes.",
    };
  },
});
