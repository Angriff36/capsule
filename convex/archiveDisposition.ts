"use node";
/**
 * AUTHOR SEAM — archive disposition classification (R2-5, PR01-02/PR01-09).
 *
 * One governed action classifies every still-pending ImportArtifact of an
 * inventoried archive into exactly one disposition with counted row
 * outcomes, then persists the run-level roll-up (dispositionCounts +
 * unaccountedRecordCount) that the ImportRun commit gate reads. Node
 * runtime: classification inflates workbooks through the zip reader's
 * node:zlib.
 *
 * Why an action: same shape as archiveInventory — parsing is too heavy for a
 * mutation, and "no second write API" keeps materialization exclusively in
 * importCommit. This seam writes only import-pipeline metadata through the
 * generated ImportArtifact_recordParse / ImportArtifact_classify /
 * ImportRun_recordDispositionSummary commands, so every row keeps its
 * manifest event and version.
 *
 * Duplicate detection is by content checksum within the run: the first
 * occurrence of identical workbook bytes classifies by content; every later
 * copy becomes duplicate_view (a second exported view of the same data).
 * Re-classifying by hand (e.g. linked_reference for reference data) stays
 * possible through the governed classify command — re-running this action
 * never touches already-classified artifacts.
 */
import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";
import {
  readZipEntries,
  ZipArchiveError,
} from "../src/lib/tppReports/zipReader";
import { classifyWorkbook } from "../src/lib/tppReports/workbookDisposition";

/** Mirrors the coordinator's import gate (convex/importCoordinator.ts). */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ArchiveDispositionResult {
  classified: number;
  skipped: number;
  dispositionCounts: Record<string, number>;
  unaccountedRecordCount: number;
}

export const classifyArchiveWorkbooks = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<ArchiveDispositionResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) throw new ConvexError("No tenant on the session.");
    if (!canImport(auth.role)) {
      throw new ConvexError(
        "Only organization managers can classify archive workbooks.",
      );
    }

    const runCtx = await ctx.runQuery(
      internal.importCoordinator.loadImportContext,
      { importRunId: args.importRunId },
    );
    if (!runCtx || runCtx.tenantId !== auth.tenantId) {
      throw new ConvexError("Import run not found");
    }
    const run = runCtx.importRun;
    if (
      run.status === "failed" ||
      run.status === "completed" ||
      run.status === "reverted"
    ) {
      throw new ConvexError(
        `Archive classification must run before the import completes, current: ${run.status}`,
      );
    }
    if (!run.archiveStorageId) {
      throw new ConvexError(
        "Import run has no archive inventory. Run archive inventory first.",
      );
    }

    const blob = await ctx.storage.get(run.archiveStorageId as Id<"_storage">);
    if (!blob) throw new ConvexError("Archive not found in file storage.");
    const archive = Buffer.from(await blob.arrayBuffer());
    if (
      run.archiveChecksum != null &&
      sha256Hex(archive) !== run.archiveChecksum
    ) {
      throw new ConvexError(
        "Archive bytes changed since inventory. Re-run archive inventory before classifying.",
      );
    }

    // Re-read every workbook from the inventoried archive (an .xlsx is itself
    // a zip, hence allowArchiveEntries).
    let contents: Map<string, Buffer>;
    try {
      contents = readZipEntries(archive, { allowArchiveEntries: true });
    } catch (error) {
      if (error instanceof ZipArchiveError) {
        throw new ConvexError(
          `Archive classification failed (${error.code}): ${error.message}`,
        );
      }
      throw error;
    }

    const artifacts = (await ctx.runQuery(
      internal.archiveInventoryStore.listArtifacts,
      { importRunId: args.importRunId },
    )) as Array<{
      _id: Id<"importArtifacts">;
      name: string;
      checksum: string | null;
      disposition: string;
    }>;

    // Duplicate detection: identical workbook bytes within the run. The
    // canonical first occurrence is the FIRST same-checksum artifact in the
    // full stable artifact list — computed over every live artifact
    // regardless of classification state, so a resume after a mid-pair
    // crash cannot shift which copy is the duplicate: occurrence order is a
    // property of the inventory, never of this invocation.
    const checksumCounts = new Map<string, number>();
    const occurrenceById = new Map<string, number>();
    const seenSoFar = new Map<string, number>();
    for (const artifact of artifacts) {
      if (!artifact.checksum) continue;
      checksumCounts.set(
        artifact.checksum,
        (checksumCounts.get(artifact.checksum) ?? 0) + 1,
      );
      const seen = (seenSoFar.get(artifact.checksum) ?? 0) + 1;
      seenSoFar.set(artifact.checksum, seen);
      occurrenceById.set(artifact._id, seen);
    }

    let classified = 0;
    let skipped = 0;
    for (const artifact of artifacts) {
      if (artifact.disposition !== "pending") {
        skipped += 1;
        continue;
      }
      const bytes = contents.get(artifact.name);
      if (!bytes) {
        throw new ConvexError(
          `Archive entry missing after read: ${artifact.name}`,
        );
      }
      let result = classifyWorkbook(bytes);
      if (artifact.checksum) {
        const seen = occurrenceById.get(artifact._id) ?? 0;
        if ((checksumCounts.get(artifact.checksum) ?? 0) > 1 && seen > 1) {
          result = { ...result, disposition: "duplicate_view" };
        }
      }
      await ctx.runMutation(api.mutations.ImportArtifact_recordParse, {
        docId: artifact._id,
        parseStatus: result.parseStatus,
      });
      await ctx.runMutation(api.mutations.ImportArtifact_classify, {
        docId: artifact._id,
        disposition: result.disposition,
        totalRowCount: result.totalRowCount,
        rowOutcomeCounts: JSON.stringify(result.rowOutcomeCounts),
      });
      classified += 1;
    }

    // Roll-up over ALL live artifacts — a pending artifact, or one whose row
    // outcome counts do not sum to its total row count, is unaccounted.
    const fresh = (await ctx.runQuery(
      internal.archiveInventoryStore.listArtifacts,
      { importRunId: args.importRunId },
    )) as Array<{
      disposition: string;
      totalRowCount: number;
      rowOutcomeCounts: string;
    }>;
    const dispositionCounts: Record<string, number> = {};
    let unaccountedRecordCount = 0;
    for (const artifact of fresh) {
      dispositionCounts[artifact.disposition] =
        (dispositionCounts[artifact.disposition] ?? 0) + 1;
      if (artifact.disposition === "pending") {
        unaccountedRecordCount += 1;
        continue;
      }
      let countedRows = 0;
      try {
        for (const value of Object.values(
          JSON.parse(artifact.rowOutcomeCounts || "{}") as Record<
            string,
            unknown
          >,
        )) {
          countedRows += Number(value) || 0;
        }
      } catch {
        countedRows = -1;
      }
      if (countedRows !== artifact.totalRowCount) unaccountedRecordCount += 1;
    }

    await ctx.runMutation(api.mutations.ImportRun_recordDispositionSummary, {
      docId: args.importRunId,
      dispositionCounts: JSON.stringify(dispositionCounts),
      unaccountedRecordCount,
    });

    return { classified, skipped, dispositionCounts, unaccountedRecordCount };
  },
});
