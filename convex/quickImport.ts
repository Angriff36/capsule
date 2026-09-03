/**
 * AUTHOR SEAM — one-shot file import (the "Import from CSV" button).
 *
 * The generated ImportRun surface only exposes stage TRANSITIONS
 * (recordParse/validate/beginReview/approveReview/commit), so the import UI
 * forced operators to walk five hand-rolled stages — moving status flags —
 * before anything materialized. All real work happens in the authored
 * importCommit.commitImportRun; the stages are audit scaffolding.
 *
 * This seam drives the whole pipeline in one call: allocate the run
 * (importCoordinator.startImport), walk the generated transitions in order,
 * then delegate materialization to importCommit.commitImportRun. The caller
 * gets the same audit trail (ImportRun row, manifestEvents, per-record
 * ExternalRecordLinks, revert support, parallel-run recordCounts) with zero
 * stage ceremony.
 *
 * Rows are caller-supplied (CSV/XLSX mapped client-side to the parser shapes
 * in convex/tppParser.ts). Chunk large files client-side (~500 rows per call)
 * to stay well inside the 1MB action-arg limit; each chunk is its own run, so
 * revert and the reconcile queue stay per-chunk precise.
 */
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";
import type { CommitResult } from "./importCommit";

export const importFile = action({
  args: {
    datasetType: v.string(),
    sourceSystem: v.string(),
    rows: v.array(v.any()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ importRunId: Id<"importRuns"> } & CommitResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) throw new ConvexError("No tenant on the session.");
    if (
      !["manager", "admin", "owner", "system"].includes(auth.role) &&
      !auth.role.endsWith("_manager")
    ) {
      throw new ConvexError("Only organization managers can run imports.");
    }
    if (args.rows.length === 0) {
      throw new ConvexError("No rows provided — nothing to import.");
    }

    // Allocate the run, then walk the generated stage transitions in the
    // state-machine order (started→parsing→validating→reviewing→committing).
    const started = await ctx.runMutation(api.importCoordinator.startImport, {
      sourceSystem: args.sourceSystem,
      datasetType: args.datasetType,
    });
    const runId = started.importRunId;

    const counts = JSON.stringify({ [args.datasetType]: args.rows.length });
    await ctx.runMutation(api.mutations.ImportRun_recordParse, {
      docId: runId,
      recordCounts: counts,
    });
    await ctx.runMutation(api.mutations.ImportRun_validate, { docId: runId });
    await ctx.runMutation(api.mutations.ImportRun_beginReview, {
      docId: runId,
    });
    await ctx.runMutation(api.mutations.ImportRun_approveReview, {
      docId: runId,
      finalRecordCounts: counts,
    });

    // Materialize. commitImportRun re-checks auth + the committing status we
    // just set, and flips the run to completed itself.
    const result = await ctx.runAction(api.importCommit.commitImportRun, {
      importRunId: runId,
      rawRows: args.rows,
    });
    return { importRunId: runId, ...result };
  },
});
