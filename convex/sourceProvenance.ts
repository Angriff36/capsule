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
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

    // AC-181: a client keeps the old-system links of every client merged
    // into it, each marked with the name it was imported under.
    const merged = await mergedClients(ctx, auth.tenantId, capsuleId);
    const mergedName = new Map(merged.map((m) => [m.clientId, m.name]));

    // Read only this record's links (and its merged clients'). A whole-tenant
    // scan timed out the proposals page once an import left thousands of
    // links, because every proposal row runs this query.
    const tenantId = auth.tenantId;
    const rows = [];
    for (const id of [capsuleId, ...mergedName.keys()]) {
      rows.push(
        ...(await ctx.db
          .query("externalRecordLinks")
          .withIndex("by_tenantId_and_capsuleId", (q) =>
            q.eq("tenantId", tenantId).eq("capsuleId", id),
          )
          .collect()),
      );
    }
    const links = rows
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.conflictStatus !== "superseded" &&
          (row.capsuleId === capsuleId || mergedName.has(row.capsuleId)),
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    // AC-271: an archive-sourced record points the operator at its run, where
    // the per-cell provenance (coordinates, raw serial, parser version) is kept
    // apart from the normalized value. Only the tenant's own runs count.
    const archiveRuns = new Set<string>();
    for (const runId of new Set(links.map((row) => row.sourceImportRunId))) {
      if (!runId) continue;
      const run = await ctx.db.get(runId);
      if (run && run.tenantId === auth.tenantId && run.archiveStorageId) {
        archiveRuns.add(runId);
      }
    }

    return links.map((row) => ({
      sourceSystem: row.sourceSystem,
      recordType: row.recordType,
      externalId: row.externalId,
      conflictStatus: row.conflictStatus,
      verified: row.verified,
      sourceImportRunId: row.sourceImportRunId ?? null,
      fromReportFile: row.sourceImportRunId
        ? archiveRuns.has(row.sourceImportRunId)
        : false,
      importedAt: row.createdAt ?? null,
      resolutionNote: row.resolutionNote ?? null,
      rawSourceData: row.rawSourceData ?? null,
      mergedFromName: mergedName.get(row.capsuleId) ?? null,
    }));
  },
});

/** AC-181: the earlier names of a client: every client merged into it. */
export const listMergedClients = query({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !IMPORT_ACCESS_ROLES.has(auth.role)) return [];
    return await mergedClients(ctx, auth.tenantId, clientId);
  },
});

async function mergedClients(
  ctx: QueryCtx,
  tenantId: string,
  clientId: string,
): Promise<Array<{ clientId: string; name: string; mergedAt: number | null }>> {
  const root = ctx.db.normalizeId("clients", clientId);
  if (!root) return [];
  const found: Array<{
    clientId: string;
    name: string;
    mergedAt: number | null;
  }> = [];
  const seen = new Set<string>([root]);
  const queue: Id<"clients">[] = [root];
  // A merge chain (C into B, then B into A) keeps every earlier name.
  while (queue.length > 0) {
    const into = queue.shift()!;
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_mergedIntoClientId", (q) =>
        q.eq("mergedIntoClientId", into),
      )
      .collect();
    for (const row of rows) {
      if (row.tenantId !== tenantId || seen.has(row._id)) continue;
      seen.add(row._id);
      queue.push(row._id);
      const name =
        row.clientType === "company"
          ? (row.companyName ?? "")
          : [row.givenName, row.familyName].filter(Boolean).join(" ");
      found.push({
        clientId: row._id,
        name: name || "Unnamed client",
        mergedAt: row.mergedAt ?? null,
      });
    }
  }
  return found;
}
