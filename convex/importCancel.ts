/**
 * AUTHOR SEAM — stop an import that is still running (PL-IMPORT-RESUME,
 * AC-631 / spec BE-16.3: "Cancellation stops unstarted work and compensates
 * only unchanged records owned by that run").
 *
 * Stop = the run leaves "committing" (ImportRun_markFailed, so the stop is a
 * governed, audited step). A commit worker checks the run before every record
 * (importCommit.commitImportRun stopIfStopped) and starts nothing after it.
 *
 * Take back = every record THIS run made (its own resolved link) that nobody
 * changed since the link was written is soft-deleted, with the files and pack
 * items the run made under it, and its link is retired. A record a person (or
 * a later import) changed stays, and is reported as kept. Payment references
 * and items still waiting on the matching screen are only retired: they are
 * links, not records. Both the stop and the worker that notices it run the
 * take-back; it is safe to run twice.
 *
 * Known gap: a record made in the instant before a worker died, with no link
 * yet, is not found here (nothing ties it to the run but its create key).
 */
import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { IMPORT_RECORD_HOMES, readMadeSnapshot } from "./lib/importRecordHomes";

/** Mirrors importCommit.canImport (managers + system). */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

const RECORD_HOMES = IMPORT_RECORD_HOMES;

/** A name for the kept list, from the source row (never encrypted fields). */
function sourceLabel(raw: string | null | undefined): string {
  try {
    const row = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";
    return (
      text(row.title) ||
      text(row.name) ||
      text(row.opportunityName) ||
      [text(row.givenName), text(row.familyName)].filter(Boolean).join(" ")
    );
  } catch {
    return "";
  }
}

export const runIsCommitting = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<boolean> => {
    const run = await ctx.db.get(args.importRunId);
    return run !== null && run.deletedAt == null && run.status === "committing";
  },
});

/** One bounded page of the run's live links (cursor-paged: kept links stay live). */
export const runLinkPage = internalQuery({
  args: {
    importRunId: v.id("importRuns"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_sourceImportRunId", (q) =>
        q.eq("sourceImportRunId", args.importRunId),
      )
      .paginate({ numItems: 200, cursor: args.cursor, maximumRowsRead: 1000 });
    return {
      linkIds: page.page
        .filter(
          (link) =>
            link.deletedAt == null &&
            (link.conflictStatus === "resolved" ||
              link.conflictStatus === "pending_conflict"),
        )
        .map((link) => link._id),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export type TakeBackOutcome =
  | { kind: "removed" }
  | { kind: "kept"; label: string }
  | { kind: "retired" }
  | { kind: "none" };

/** One link, one transaction: take back its record if nobody changed it. */
export const takeBackLink = internalMutation({
  args: {
    importRunId: v.id("importRuns"),
    linkId: v.id("externalRecordLinks"),
  },
  handler: async (ctx, args): Promise<TakeBackOutcome> => {
    const run = await ctx.db.get(args.importRunId);
    const link = await ctx.db.get(args.linkId);
    // Only a stopped run gives anything back: a run that finished (for
    // example by a second worker) keeps every record.
    if (
      !run ||
      run.status !== "failed" ||
      !link ||
      link.tenantId !== run.tenantId ||
      link.sourceImportRunId !== args.importRunId ||
      link.deletedAt != null ||
      (link.conflictStatus !== "resolved" &&
        link.conflictStatus !== "pending_conflict")
    ) {
      return { kind: "none" };
    }
    const now = Date.now();
    const retireLink = async (note: string) => {
      await ctx.db.patch(link._id, {
        conflictStatus: "superseded",
        effectiveEndDate: now,
        resolutionNote: note,
        updatedAt: now,
        version: (link.version ?? 0) + 1,
      });
    };

    const home = RECORD_HOMES[link.recordType];
    const recordId =
      home && link.capsuleId
        ? ctx.db.normalizeId(home.table, link.capsuleId)
        : null;
    // A look-alike record the run made (PL-SOURCE-IDENTITY) waits on the match
    // list but is still the run's own record, so it carries a made snapshot.
    const runMadeRecord =
      link.conflictStatus === "resolved" ||
      readMadeSnapshot(link.metadata).madeVersion !== undefined;
    if (!home || !recordId || !runMadeRecord) {
      await retireLink("Retired: the import was stopped.");
      return { kind: "retired" };
    }
    const record = (await ctx.db.get(recordId)) as Record<string, unknown> & {
      _id: Id<TableNames>;
      tenantId?: string;
      deletedAt?: number | null;
    };
    if (!record || record.tenantId !== run.tenantId) {
      await retireLink("Retired: the import was stopped.");
      return { kind: "retired" };
    }
    if (record.deletedAt != null) {
      await retireLink("Taken back: the import was stopped.");
      return { kind: "removed" };
    }

    // The record as the run finished it (version + last change, kept on the
    // link), and when: the link is written after the record and everything
    // the run made under it. Links from before the snapshot fall back to time.
    const made = readMadeSnapshot(link.metadata);
    const madeAt =
      made.madeAt ??
      Math.max(
        typeof link.createdAt === "number" ? link.createdAt : 0,
        typeof link.appliedAt === "number" ? link.appliedAt : 0,
      );
    const changedAfter = (value: unknown) =>
      typeof value === "number" && value > madeAt;
    const label = sourceLabel(link.rawSourceData) || link.externalId;

    let changed =
      (made.madeVersion !== undefined
        ? record.version !== made.madeVersion ||
          record.updatedAt !== made.madeUpdatedAt
        : changedAfter(record.updatedAt)) ||
      (await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", link.capsuleId))
        .filter((q) => q.gt(q.field("createdAt"), madeAt))
        .first()) !== null;

    const eventFiles =
      home.table === "events"
        ? await ctx.db
            .query("attachments")
            .withIndex("by_parentId", (q) => q.eq("parentId", link.capsuleId))
            .collect()
        : [];
    const packItems =
      home.table === "packLists"
        ? await ctx.db
            .query("packListItems")
            .withIndex("by_packListId", (q) =>
              q.eq("packListId", recordId as Id<"packLists">),
            )
            .collect()
        : [];
    if (!changed && home.table === "events") {
      changed =
        eventFiles.some(
          (file) =>
            file.tenantId === run.tenantId &&
            changedAfter(file.uploadedAt ?? file.createdAt),
        ) ||
        (await ctx.db
          .query("eventDishes")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", recordId as Id<"events">),
          )
          .filter((q) => q.gt(q.field("createdAt"), madeAt))
          .first()) !== null;
    }
    if (!changed && home.table === "packLists") {
      changed = packItems.some((item) =>
        changedAfter((item as { updatedAt?: number }).updatedAt),
      );
    }
    if (changed) {
      return { kind: "kept", label: label || link.externalId };
    }

    for (const file of eventFiles) {
      if (file.tenantId === run.tenantId && file.deletedAt == null) {
        await ctx.db.patch(file._id, { deletedAt: now, updatedAt: now });
      }
    }
    for (const item of packItems) {
      if (item.tenantId === run.tenantId && item.deletedAt == null) {
        await ctx.db.patch(item._id, { deletedAt: now });
      }
    }
    await ctx.db.patch(recordId, { deletedAt: now, updatedAt: now } as never);
    await ctx.db.insert("manifestEvents", {
      type: "ImportRecordTakenBack",
      entity: home.entity,
      entityId: link.capsuleId,
      payload: {
        tenantId: run.tenantId,
        importRunId: args.importRunId,
        externalRecordLinkId: link._id,
      },
      createdAt: now,
    });
    await retireLink("Taken back: the import was stopped.");
    return { kind: "removed" };
  },
});

export type StopResult = {
  removed: number;
  retired: number;
  kept: string[];
};

/** The run's state for a take-back: stopped or not, and its last report. */
export const stopState = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.importRunId);
    return {
      stopped: run !== null && run.status === "failed",
      stopReport: run?.stopReport ?? null,
    };
  },
});

function readStopReport(raw: string | null): StopResult {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<StopResult>;
    return {
      removed: typeof parsed.removed === "number" ? parsed.removed : 0,
      retired: typeof parsed.retired === "number" ? parsed.retired : 0,
      kept: [],
    };
  } catch {
    return { removed: 0, retired: 0, kept: [] };
  }
}

/**
 * Take back everything the stopped run made that nobody changed. The run
 * keeps a report as it goes (done: false until the last page): counts add up
 * across tries; the kept list is the current one.
 */
export async function compensateStoppedRun(
  ctx: ActionCtx,
  importRunId: Id<"importRuns">,
): Promise<StopResult> {
  const state: { stopped: boolean; stopReport: string | null } =
    await ctx.runQuery(internal.importCancel.stopState, { importRunId });
  if (!state.stopped) {
    return { removed: 0, retired: 0, kept: [] };
  }
  const result = readStopReport(state.stopReport);
  const report = async (done: boolean) => {
    await ctx.runMutation(api.mutations.ImportRun_recordStopReport, {
      docId: importRunId,
      stopReport: JSON.stringify({ ...result, done }),
    });
  };
  let cursor: string | null = null;
  for (;;) {
    const page: {
      linkIds: Id<"externalRecordLinks">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.importCancel.runLinkPage, {
      importRunId,
      cursor,
    });
    for (const linkId of page.linkIds) {
      const outcome: TakeBackOutcome = await ctx.runMutation(
        internal.importCancel.takeBackLink,
        { importRunId, linkId },
      );
      if (outcome.kind === "removed") result.removed += 1;
      else if (outcome.kind === "retired") result.retired += 1;
      else if (outcome.kind === "kept") result.kept.push(outcome.label);
    }
    if (page.isDone) break;
    await report(false);
    cursor = page.continueCursor;
  }
  await report(true);
  return result;
}

/**
 * Stop an import. A run that has not started bringing records in simply
 * stops; a run part-way through stops before its next record and gives back
 * what it made, except records someone changed since.
 */
export const cancelImportRun = action({
  args: { importRunId: v.id("importRuns"), reason: v.string() },
  handler: async (ctx, args): Promise<StopResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can stop imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status === "completed" || importRun.status === "reverted") {
      throw new ConvexError(
        "This import already finished. Use Undo import to take it back.",
      );
    }
    const reason = args.reason.trim();
    if (reason.length === 0) {
      throw new ConvexError("Say why you're stopping this import.");
    }
    // A run already stopped (or failed) is not stopped again; its take-back
    // still runs, so a stop that died part-way finishes on the next try.
    if (importRun.status !== "failed") {
      await ctx.runMutation(api.mutations.ImportRun_markFailed, {
        docId: args.importRunId,
        failureDetails: `Stopped by a person: ${reason}`,
      });
    }
    return await compensateStoppedRun(ctx, args.importRunId);
  },
});
