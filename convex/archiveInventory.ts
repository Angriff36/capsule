"use node";
/**
 * AUTHOR SEAM — archive inventory (R2-3) + index reconciliation inputs (R2-4).
 *
 * One governed action safe-lists an uploaded TPP report archive into one
 * ImportArtifact row per workbook — name, checksum, byte size, inner entry
 * count — before any parsing work starts, and records the counts the
 * ImportRun commit gate compares (the 90-vs-70 shape, AC-020). Node runtime:
 * the hardened zip reader inflates via node:zlib.
 *
 * Why an action: zip reading is too heavy for a mutation, and the spec's
 * "no second write API" rule keeps materialization exclusively in
 * importCommit — this seam only writes import-pipeline metadata through the
 * generated ImportArtifact_register / ImportRun_recordArchiveInventory
 * commands, so every row keeps its manifest event and version.
 *
 * The supplied index is caller-provided report names (the operator's index,
 * mapped client-side exactly like quickImport's rows). Reconciliation is
 * three-way: in-both / archive-only / index-only. The run stores the counts;
 * commit stays blocked until a human explains a mismatch
 * (ImportRun.commit guard, src/import/import-run.manifest).
 */
import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";
import {
  listZipEntries,
  readZipEntries,
  ZipArchiveError,
} from "../src/lib/tppReports/zipReader";

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

/** Surface a bounded, named zip failure as the action's error (PR01-07). */
function archiveFailure(error: unknown): never {
  if (error instanceof ZipArchiveError) {
    throw new ConvexError(
      `Archive inventory failed (${error.code}): ${error.message}`,
    );
  }
  throw error instanceof Error
    ? error
    : new ConvexError("Archive inventory failed");
}

export interface ArchiveInventoryResult {
  registered: number;
  skipped: number;
  workbooks: Array<{
    name: string;
    checksum: string;
    byteSize: number;
    entryCount: number;
  }>;
  reconciliation: {
    archiveWorkbookCount: number;
    indexWorkbookCount: number;
    inBoth: number;
    archiveOnly: string[];
    indexOnly: string[];
  };
}

export const inventoryArchive = action({
  args: {
    importRunId: v.id("importRuns"),
    storageId: v.id("_storage"),
    indexReportNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ArchiveInventoryResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) throw new ConvexError("No tenant on the session.");
    if (!canImport(auth.role)) {
      throw new ConvexError(
        "Only organization managers can inventory archives.",
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
    if (run.status !== "started" && run.status !== "parsing") {
      throw new ConvexError(
        `Archive inventory must run while the import is started or parsing, current: ${run.status}`,
      );
    }

    const blob = await ctx.storage.get(args.storageId as Id<"_storage">);
    if (!blob) throw new ConvexError("Archive not found in file storage.");
    const archive = Buffer.from(await blob.arrayBuffer());

    // Safe-list pass first: structure, names and declared sizes are checked
    // with zero decompression, so hostile inputs fail before any inflate.
    let workbookNames: string[];
    try {
      const listing = listZipEntries(archive, { allowArchiveEntries: true });
      workbookNames = listing
        .filter(
          (entry) =>
            !entry.isDirectory && entry.name.toLowerCase().endsWith(".xlsx"),
        )
        .map((entry) => entry.name);
    } catch (error) {
      archiveFailure(error);
    }

    // Read every workbook's original bytes (an .xlsx is itself a zip, hence
    // allowArchiveEntries). Encrypted/corrupt/oversized inputs fail here with
    // a named code — the inventory never silently drops a workbook.
    let contents: Map<string, Buffer>;
    try {
      contents = readZipEntries(archive, { allowArchiveEntries: true });
    } catch (error) {
      archiveFailure(error);
    }

    const indexNames = args.indexReportNames ?? [];
    const indexSet = new Set(indexNames);
    const workbookSet = new Set(workbookNames);
    const archiveOnly = workbookNames.filter((name) => !indexSet.has(name));
    const indexOnly = indexNames.filter((name) => !workbookSet.has(name));

    const existing = new Set(
      (await ctx.runQuery(internal.archiveInventoryStore.listArtifactNames, {
        importRunId: args.importRunId,
      })) as string[],
    );

    let registered = 0;
    let skipped = 0;
    const workbooks: ArchiveInventoryResult["workbooks"] = [];
    for (const name of workbookNames) {
      const content = contents.get(name);
      if (!content) {
        throw new ConvexError(`Archive entry missing after read: ${name}`);
      }
      const checksum = sha256Hex(content);

      // The workbook's own container: count parts from its central directory.
      // An unreadable container is recorded, not hidden — the parse stage
      // (R2-5) classifies it invalid.
      let entryCount = 0;
      let containerError: string | undefined;
      try {
        entryCount = listZipEntries(content).length;
      } catch (error) {
        containerError =
          error instanceof ZipArchiveError ? error.code : "unknown";
      }

      if (existing.has(name)) {
        skipped += 1;
        workbooks.push({
          name,
          checksum,
          byteSize: content.length,
          entryCount,
        });
        continue;
      }

      const provenance = JSON.stringify({
        archiveEntry: name,
        containerError,
        indexed: indexSet.has(name) ? "in_both" : "archive_only",
      });
      const docId = (await ctx.runMutation(
        internal.archiveInventoryStore.allocateArtifactDraft,
        { tenantId: auth.tenantId, importRunId: args.importRunId },
      )) as Id<"importArtifacts">;
      await ctx.runMutation(api.mutations.ImportArtifact_register, {
        docId,
        importRunId: args.importRunId,
        name,
        byteSize: content.length,
        entryCount,
        checksum,
        provenance,
      });
      registered += 1;
      workbooks.push({ name, checksum, byteSize: content.length, entryCount });
    }

    await ctx.runMutation(api.mutations.ImportRun_recordArchiveInventory, {
      docId: args.importRunId,
      archiveWorkbookCount: workbookNames.length,
      archiveStorageId: args.storageId,
      archiveChecksum: sha256Hex(archive),
      indexWorkbookCount: indexNames.length,
    });

    return {
      registered,
      skipped,
      workbooks,
      reconciliation: {
        archiveWorkbookCount: workbookNames.length,
        indexWorkbookCount: indexNames.length,
        inBoth: indexNames.length - indexOnly.length,
        archiveOnly,
        indexOnly,
      },
    };
  },
});
