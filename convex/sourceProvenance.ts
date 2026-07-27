// AUTHOR SEAM — source provenance for a Capsule entity.
//
// Spec §6.1 ("preserve enough raw source data … to explain mappings later")
// and §6.5 ("drillable to source + Capsule records") require an operator
// viewing an imported record to see where it came from. The generated
// ExternalRecordLink reads list/get by tenant or import run only; there is
// no generated find-by-capsuleId (findByCapsule is declared in
// src/import/external-record-link.manifest:287 but the generator never
// emitted it). This query fills that gap: given a capsuleId (e.g. an
// Event's _id), return the active ExternalRecordLink(s) pointing at it.
//
// Additive READ only — no new write guard, no manifest/regen, no schema
// change (per docs/architecture/domain-gating-restraint.md). Gated on the
// same importAccess capability as the entity's own read policy
// (external-record-link.manifest:97) so the seam does not widen access.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

// Mirror of the roles granted `importAccess` in src/foundation/base.manifest
// (manager + every *_manager + admin/owner/system via `extends`). checkRole is
// generated into convex/queries.ts and convex/mutations.ts as a LOCAL helper
// (not exported), so an authored seam re-checks the same set here. Keep in
// sync with base.manifest if the importAccess grant moves.
const IMPORT_ACCESS_ROLES = new Set([
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

export const listByCapsuleId = query({
  args: { capsuleId: v.string() },
  handler: async (ctx, { capsuleId }) => {
    const auth = await getAuthContext(ctx);
    // Non-importAccess callers (or no tenant) see nothing — matches the
    // entity read policy; the panel renders no section for them.
    if (!auth.tenantId || !IMPORT_ACCESS_ROLES.has(auth.role)) return [];
    if (!capsuleId) return [];

    // ponytail: no by_capsuleId index exists (only by_tenantId /
    // by_sourceImportRunId), so collect the tenant's links and filter in JS —
    // the same shape as the generated listExternalRecordLinkByTenantId the
    // reconcile page already uses. Upgrade to a by_capsuleId index only if a
    // tenant's link volume makes the scan measurable.
    const rows = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();

    return rows
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.conflictStatus !== "superseded" &&
          row.capsuleId === capsuleId,
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .map((row) => ({
        sourceSystem: row.sourceSystem,
        recordType: row.recordType,
        externalId: row.externalId,
        conflictStatus: row.conflictStatus,
        verified: row.verified,
        sourceImportRunId: row.sourceImportRunId ?? null,
        importedAt: row.createdAt ?? null,
        resolutionNote: row.resolutionNote ?? null,
        rawSourceData: row.rawSourceData ?? null,
      }));
  },
});
