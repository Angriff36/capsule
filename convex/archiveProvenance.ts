"use node";
/**
 * AUTHOR SEAM — archive provenance recording (R2-8, PR01-03).
 *
 * One governed action records source provenance for every inventoried
 * workbook of an import run: coordinates, raw stored values, interpreted
 * values, date system, timezone assumption and parser version, persisted
 * through the generated ImportArtifact_recordParse command into the
 * artifact's provenance JSON. Node runtime: the typed workbook reader
 * inflates workbook parts through the zip reader's node:zlib.
 *
 * Why an action: same shape as archiveInventory / archiveDisposition —
 * parsing is too heavy for a mutation, and "no second write API" keeps
 * materialization exclusively in importCommit. This seam writes only
 * import-pipeline metadata, so every row keeps its manifest event and
 * version.
 *
 * Idempotence: an artifact whose provenance already carries a `workbook`
 * document is skipped — re-running records nothing new. Works before OR
 * after archiveDisposition (classification records parse status without
 * provenance; both orders converge). An unreadable container records a
 * named error document and parseStatus "failed", never a silent blank.
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
import {
  buildWorkbookProvenance,
  workbookErrorProvenance,
} from "../src/lib/tppReports/workbookProvenance";

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

export interface ArchiveProvenanceResult {
  recorded: number;
  skipped: number;
}

export const recordArchiveProvenance = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<ArchiveProvenanceResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) throw new ConvexError("No tenant on the session.");
    if (!canImport(auth.role)) {
      throw new ConvexError(
        "Only organization managers can record archive provenance.",
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
        `Provenance recording must run before the import completes, current: ${run.status}`,
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
        "Archive bytes changed since inventory. Re-run archive inventory before recording provenance.",
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
          `Provenance recording failed (${error.code}): ${error.message}`,
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
      provenance: string;
    }>;

    let recorded = 0;
    let skipped = 0;
    for (const artifact of artifacts) {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(artifact.provenance || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        current = {};
      }
      if (current.workbook !== undefined) {
        skipped += 1;
        continue;
      }
      const bytes = contents.get(artifact.name);
      if (!bytes) {
        throw new ConvexError(
          `Archive entry missing after read: ${artifact.name}`,
        );
      }
      // The preserved original never changes — the typed reader records raw
      // next to interpreted; unreadable containers record a named error.
      let workbook: unknown;
      let parseStatus: "parsed" | "failed";
      try {
        workbook = buildWorkbookProvenance(bytes);
        parseStatus = "parsed";
      } catch (error) {
        workbook = workbookErrorProvenance(error);
        parseStatus = "failed";
      }
      await ctx.runMutation(api.mutations.ImportArtifact_recordParse, {
        docId: artifact._id,
        parseStatus,
        provenance: JSON.stringify({ ...current, workbook }),
      });
      recorded += 1;
    }

    return { recorded, skipped };
  },
});
