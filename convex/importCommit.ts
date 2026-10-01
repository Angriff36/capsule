/**
 * AUTHOR SEAM — real ImportRun commit/revert (spec §6.1 / §6.2 / §5.3).
 *
 * Why this exists: the generated `ImportRun_commit` / `ImportRun_revert` commands
 * (convex/mutations.ts, do-not-edit) only flip the run's status + emit an audit
 * event — they write ZERO business data. The orphaned `importCoordinator.ts`
 * `commitImport`/`revertImport` carry explicit TODOs. So an operator clicking
 * "Complete Commit" got a green "Completed" run with no records imported (silent
 * false-success), and §5.3's "imported TPP Event uses the same create-proposal
 * command" had no imported events to act on.
 *
 * This seam makes commit/revert REAL for the **venues**, **contacts**,
 * **events**, and **leads** datasets: caller-supplied TPP rows are parsed,
 * materialized into entities via the generated `Venue_createViaRegister`
 * (handles encryption + eventManageAccess guard), `Client_createViaRegister`
 * (person-type client account; salesAccess guard),
 * `Event_createViaPlanEngagement` (the create verb; eventManageAccess/
 * salesAccess guard), or `Lead_createViaCapture` (the create verb; salesAccess
 * guard), and linked idempotently through ExternalRecordLink. Re-run is safe
 * (per-record idempotencyKey + link dedup).
 * R2-6 resume (PR01-05): every dataset branch is a resumable loop — the
 * optional maxRecords arg stops after N terminal outcomes (persisting the
 * ImportRun commit checkpoint), a crashed invocation leaves exactly that
 * durable state, and re-invoking creates ONLY the missing records: own-run
 * links skip silently, foreign-run links count as skipped, and a record
 * whose create committed but whose link did not (the crash window) is
 * re-created under the same idempotencyKey — the generated create returns
 * the ORIGINAL docId with zero writes, so a newer user edit is never
 * replaced. "failed" is terminal, so a commit fault must never markFailed;
 * the resumable state is "committing" + checkpoint (see quickImport).
 * Revert supersedes the run's links (dataset-agnostic).
 *
 * Events resolve cross-dataset: a TPP Event's external `ClientID`/`VenueID` are
 * looked up against prior contacts/venues imports (recordType "contact"/"venue"
 * → Capsule id) before the Event is created; an event whose client was not
 * imported becomes a `pending_conflict` link (reconcile queue) rather than
 * fabricating a client. The TPP-mapped stage is NOT applied (the create command
 * hardcodes `stage: "planning"` and exposes no stage arg); the raw TPP
 * EventStatus is preserved on the link's rawSourceData for parallel-run
 * reconciliation (§6.1).
 *
 * Leads need NO cross-dataset resolution: a Lead is the PRE-client inquiry
 * (`clientId` is optional, set only on conversion), so a TPP opportunity/
 * pipeline row becomes a company-type Lead (`OpportunityName` → companyName)
 * without resolving its external `ClientID`. The TPP stage is NOT applied
 * (`capture` hardcodes stage "new"); the raw TPP ClientID + stage are preserved
 * on the link's rawSourceData for parallel-run reconciliation (§6.1).
 *
 * Payments materialize as reconciliation-reference LINKS, NOT Payment entities
 * (spec §6.4). `Payment.record` requires a Capsule invoice + client that NO
 * import produces (there is no invoice dataset), and §6.4 treats imported
 * payments as references matched (`Payment.markMatched`) against EXISTING
 * Capsule payments — "retain source, external transaction ID, amount, date,
 * type, event/client reference, and reconciliation state." So each TPP payment
 * becomes a `pending_conflict` ExternalRecordLink (recordType "payment",
 * capsuleEntity "payment", capsuleId "") awaiting a reconciliation match in the
 * queue; the external EventID is cross-resolved against the prior events import
 * for matching context. No Payment entity is created — by design (the spec's
 * reference model), not omission.
 *
 * Menus materialize as Dish entities, one per TPP dish-catalog row (the
 * work/dishes.csv export has no menu grouping, no external id, and EMPTY price
 * columns). Dish has no price field, so price_per_person / cost_per_person are
 * preserved on the link's rawSourceData (the §6.2 "prices" captured verbatim
 * from the source) rather than inventing a Menu+MenuDish pricing graph for
 * empty data. A future TPP export with real prices is the follow-up slice for a
 * queryable MenuDish.sellingPrice. `Dish_createViaIntroduce` is kitchenAccess-
 * guarded (not salesAccess), so a role with importAccess but not kitchenAccess
 * sees every dish land as pending_conflict; the dish name is slugified into the
 * link externalId (no id column in the feed).
 *
 * Pack lists materialize as Equipment PackList + PackListItem (spec §6.3). TPP
 * has no bulk export for per-event pack lists, so each caller-supplied row is
 * ONE event's browser-extracted pack list (source event id + page/version +
 * extraction time + nested items[text, qty, unit, group]). The source event is
 * cross-resolved against the prior events import (recordType "event") before
 * `PackList_createViaOpen` (logisticsAccess guard); each item becomes a
 * `PackListItem_createViaAddItem` (description-only when no Equipment/Dish
 * mapping — the §6.3 "unrecognized items may remain as imported free-text
 * lines" path). Idempotent per-event (externalId = sourceEventId); item-level
 * failures are recorded as extraction errors on the link without failing the
 * whole list.
 *
 * ponytail: ceiling — venues + contacts + events + leads + payments + menus +
 * pack lists ship here (all six §6.2 datasets + §6.3 pack lists). Revert
 * supersedes links but leaves imported
 * entities in place (an event may already reference one; deactivation is an
 * operator action) — documented honesty, not silent deletion. Source rows are
 * caller-supplied (TPP has no bulk export, spec §6.3), so this is the manual/
 * JSON-paste migration path.
 */
import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import {
  parseTppContacts,
  parseTppEvents,
  parseTppLeads,
  parseTppMenus,
  parseTppPackLists,
  parseTppPayments,
  parseTppVenues,
  type ParsedCapsuleEvent,
  type ParsedCapsuleLead,
  type ParsedCapsuleMenu,
  type ParsedCapsulePackList,
  type ParsedCapsulePayment,
  type TppContactRecord,
  type TppEventRecord,
  type TppLeadRecord,
  type TppMenuRecord,
  type TppPackListRecord,
  type TppPaymentRecord,
  type TppVenueRecord,
} from "./tppParser";
import type { Doc, Id } from "./_generated/dataModel";
import { FINANCIAL_ROW_LABEL } from "../src/lib/financialRowClass";
import { buildLinkKey } from "./lib/culinaryModel/importMapping";
import {
  clientLookAlikeNote,
  venueLookAlikeNote,
  type LookAlikeClient,
  type LookAlikeVenue,
} from "./lib/importIdentity";
import { SERVICE_STYLE_RECORD_TYPE } from "./importServiceStyle";
import { commitStockRows } from "./openingStock";
import { reconcileExistingLink, type DeltaOutcome } from "./importSourceDelta";
import { attachImportedEventFiles } from "./lib/importEventFiles";
import {
  COMPANY_RECORD_TYPE,
  commitImportedCompany,
  importedCompanyName,
} from "./lib/importCompanies";
import { compensateStoppedRun } from "./importCancel";
import { madeSnapshot } from "./lib/importRecordHomes";
import {
  eventRequirementsText,
  SOURCE_FIELD_MAPS,
  sourceVersionOf,
  type SourceDeltaDataset,
} from "./lib/importSourceFields";

/**
 * Canonical ExternalRecordLink key for an import-commit identity. Commit links
 * carry no sourceAccount/role/ordinal, so they take buildLinkKey's defaults.
 * Lookups go through the `by_linkKey` index: a `by_tenantId` + `.filter` scan
 * read every tenant link row per imported row (17 GB Database I/O, 2026-09).
 */
function commitLinkKey(args: {
  sourceSystem: string;
  recordType: string;
  externalId: string;
}): string {
  return buildLinkKey({
    sourceSystem: args.sourceSystem,
    sourceAccount: null,
    recordType: args.recordType,
    externalId: args.externalId,
    role: null,
    ordinal: 0,
  });
}

/** Import access matches `importCoordinator.canImport` (managers + system). */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

type CommitContext = {
  role: string;
  tenantId: string;
  actorId: string;
  importRun: Doc<"importRuns">;
};

/** Full-fidelity auth (query has ctx.db) + the run, in one read. */
export const loadCommitContext = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<CommitContext | null> => {
    const auth = await getAuthContext(ctx);
    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.deletedAt != null) return null;
    return {
      role: auth.role,
      tenantId: auth.tenantId,
      actorId: auth.id,
      importRun,
    };
  },
});

/**
 * Find an existing ACTIVE (non-superseded), non-deleted link for
 * (tenant, source, recordType, externalId). Excluding superseded matters: after
 * a revert, re-importing the same external venue must NOT be treated as an
 * idempotent skip (the old link is superseded, not active) — it should
 * re-materialize + reactivate.
 */
export const findLink = internalQuery({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks"> | null> => {
    // The index narrows to the rows with this exact identity (any tenant);
    // the filter only checks tenant + liveness on that handful.
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_linkKey", (q) => q.eq("linkKey", commitLinkKey(args)))
      .filter((q) =>
        q.and(
          q.eq(q.field("tenantId"), args.tenantId),
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .first();
  },
});

/**
 * Active (non-superseded), non-deleted links created by a given import run.
 * Bounded per page; `revertImportRun` pages until exhausted (superseding a
 * batch drops it from the next query), so a run with >500 links fully reverts.
 */
export const linksForRun = internalQuery({
  args: { sourceImportRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks">[]> => {
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_sourceImportRunId", (q) =>
        q.eq("sourceImportRunId", args.sourceImportRunId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .take(500);
  },
});

/**
 * ONE bounded page of the live, non-superseded links a run created — the
 * durable floor input for the final commit checkpoint (review R2-14). Each
 * call reads at most 500 docs; completeRun accumulates across calls, so a
 * large import never blows a single query's transaction read budget
 * (Convex query guidance: unbounded accumulation belongs outside the
 * transaction).
 */
export const countRunLinks = internalQuery({
  args: {
    sourceImportRunId: v.id("importRuns"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    count: number;
    isDone: boolean;
    continueCursor: string;
  }> => {
    const page = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_sourceImportRunId", (q) =>
        q.eq("sourceImportRunId", args.sourceImportRunId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .paginate({
        numItems: 500,
        cursor: args.cursor ?? null,
        // numItems is a target, not a scan bound (reactive pagination +
        // filtered-out rows still read) — maximumRowsRead is the hard cap;
        // a partial page just continues via the cursor.
        maximumRowsRead: 1000,
      });
    return {
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * AC-271: a link keeps the normalized record (read back by later datasets,
 * e.g. events → contact name) AND the input row exactly as received, under
 * its own `sourceRow` key, so raw source stays apart from the interpretation.
 */
function withSourceRow(normalized: object, sourceRow: unknown): string {
  return JSON.stringify({ ...normalized, sourceRow: sourceRow ?? null });
}

/** The client a merged client now lives on (itself when never merged). */
export const survivingClientId = internalQuery({
  args: { tenantId: v.string(), clientId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    let id = ctx.db.normalizeId("clients", args.clientId);
    if (!id) return args.clientId;
    let surviving: string = args.clientId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const row: Doc<"clients"> | null = await ctx.db.get(id);
      if (!row || row.tenantId !== args.tenantId) break;
      surviving = id;
      id = row.mergedIntoClientId ?? null;
    }
    return surviving;
  },
});

/** Insert or update the link for a (tenant, source, recordType, externalId) key. */
export const upsertLink = internalMutation({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
    capsuleEntity: v.string(),
    capsuleId: v.string(),
    sourceImportRunId: v.id("importRuns"),
    rawSourceData: v.string(),
    conflictStatus: v.union(
      v.literal("resolved"),
      v.literal("pending_conflict"),
    ),
    resolutionNote: v.optional(v.string()),
    // PL-SOURCE-DELTA: the values this import wrote into Capsule, so a later
    // run can tell a source change from a person's edit.
    appliedValues: v.optional(v.string()),
    sourceVersion: v.optional(v.string()),
    // PL-SOURCE-IDENTITY: this run made the record, but it waits for a person
    // (a look-alike), so the link is pending yet keeps the made snapshot.
    madeRecord: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"externalRecordLinks">> => {
    const linkKey = commitLinkKey(args);
    const baseline =
      args.appliedValues !== undefined
        ? {
            appliedValues: args.appliedValues,
            appliedSourceVersion: args.sourceVersion,
            appliedAt: Date.now(),
            appliedImportRunId: String(args.sourceImportRunId),
            sourceVersion: args.sourceVersion,
            lastSeenAt: Date.now(),
            lastSeenImportRunId: String(args.sourceImportRunId),
          }
        : {};
    // AC-631: the record as this run finished it, so a stopped run can tell
    // an untouched record from one a person changed.
    const made =
      args.conflictStatus === "resolved" || args.madeRecord === true
        ? await madeSnapshot(ctx.db, args.recordType, args.capsuleId)
        : undefined;
    const madeMetadata = made !== undefined ? { metadata: made } : {};
    const existing = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_linkKey", (q) => q.eq("linkKey", linkKey))
      .filter((q) =>
        q.and(
          q.eq(q.field("tenantId"), args.tenantId),
          q.eq(q.field("deletedAt"), null),
        ),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        capsuleEntity:
          args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
        capsuleId: args.capsuleId,
        sourceImportRunId: args.sourceImportRunId,
        rawSourceData: args.rawSourceData,
        conflictStatus: args.conflictStatus,
        resolutionNote: args.resolutionNote ?? existing.resolutionNote,
        ...baseline,
        ...madeMetadata,
        updatedAt: now,
        version: existing.version + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("externalRecordLinks", {
      tenantId: args.tenantId,
      sourceSystem:
        args.sourceSystem as Doc<"externalRecordLinks">["sourceSystem"],
      recordType: args.recordType,
      externalId: args.externalId,
      linkKey,
      capsuleEntity:
        args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
      capsuleId: args.capsuleId,
      verified: false,
      sourceImportRunId: args.sourceImportRunId,
      rawSourceData: args.rawSourceData,
      conflictStatus: args.conflictStatus,
      resolutionNote: args.resolutionNote,
      ...baseline,
      ...madeMetadata,
      // SoftDeletable shape: generated creates stamp deletedAt: null, and
      // findLink/linksForRun filter q.eq(deletedAt, null) — an insert without
      // the key leaves it undefined and every cross-dataset findLink
      // (events→contact, payments→event, pack_list→event) silently misses.
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
  },
});

/**
 * One-time migration: stamp the canonical linkKey on link rows written before
 * findLink/upsertLink read `by_linkKey` (those rows are invisible to the index
 * until stamped). One page per run — Convex allows one paginate per function —
 * then it schedules the next page. Run once per deployment after deploy and
 * before the next import:
 *   bunx convex run importCommit:backfillLinkKeys '{}'
 * Rows that already carry a linkKey are untouched, so a re-run is a no-op.
 */
export const backfillLinkKeys = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ patched: number; isDone: boolean }> => {
    const page = await ctx.db.query("externalRecordLinks").paginate({
      numItems: args.batchSize ?? 200,
      cursor: args.cursor ?? null,
    });
    let patched = 0;
    for (const link of page.page) {
      if (link.linkKey) continue;
      await ctx.db.patch(link._id, {
        linkKey: buildLinkKey({
          sourceSystem: link.sourceSystem,
          sourceAccount: link.sourceAccount,
          recordType: link.recordType,
          externalId: link.externalId,
          role: link.role,
          ordinal: link.ordinal,
        }),
      });
      patched += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.importCommit.backfillLinkKeys, {
        cursor: page.continueCursor,
        batchSize: args.batchSize,
      });
    }
    return { patched, isDone: page.isDone };
  },
});

/** Mark a link superseded (revert). */
export const supersedeLink = internalMutation({
  args: { linkId: v.id("externalRecordLinks"), version: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.linkId, {
      conflictStatus: "superseded",
      effectiveEndDate: now,
      verified: false,
      lastVerifiedAt: now,
      updatedAt: now,
      version: args.version + 1,
    });
  },
});

/** The rows a run kept when it started committing (AC-056). */
async function readKeptRows(
  ctx: ActionCtx,
  storageId: string,
): Promise<unknown[]> {
  const blob = await ctx.storage.get(storageId as Id<"_storage">);
  if (!blob) {
    throw new ConvexError(
      "This import's saved rows are gone. Paste the rows again to continue.",
    );
  }
  const rows: unknown = JSON.parse(await blob.text());
  return Array.isArray(rows) ? rows : [];
}

export type CommitResult = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
  /**
   * R2-6 batch stop: true when maxRecords stopped this invocation with
   * unhandled records left — the run stays "committing"; re-invoke the
   * action with the same rows to resume (per-record link + idempotencyKey
   * dedup makes the resume create only the missing records).
   */
  stoppedEarly?: boolean;
  /**
   * PL-SOURCE-DELTA: records already in Capsule whose source changed. `updated`
   * took the source change; `conflicted` hold at least one field a person
   * changed too (waiting in the review list). `skipped` is then only the
   * records whose source did not change.
   */
  updated?: number;
  conflicted?: number;
  /** Cumulative records handled across this run's commit invocations. */
  processedCount?: number;
};

/**
 * Commit-stage resume checkpoint (PR01-05 / R2-6) — persisted on the run via
 * ImportRun_recordCommitCheckpoint. The run's status is the stage cursor;
 * these cumulative counts are the per-record cursor inside "committing".
 * Durable resume truth stays the per-record ExternalRecordLink + create
 * idempotency keys — the checkpoint is bookkeeping and operator visibility.
 */
type CommitCheckpoint = {
  processedCount: number;
  committedCount: number;
  skippedCount: number;
  pendingCount: number;
  updatedAt?: number;
};

/** Seed the checkpoint from the run's stored JSON (malformed ⇒ zeroed). */
function seedCheckpoint(raw: string | null | undefined): CommitCheckpoint {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<CommitCheckpoint>;
    return {
      processedCount: Math.max(0, parsed.processedCount ?? 0),
      committedCount: Math.max(0, parsed.committedCount ?? 0),
      skippedCount: Math.max(0, parsed.skippedCount ?? 0),
      pendingCount: Math.max(0, parsed.pendingCount ?? 0),
    };
  } catch {
    return {
      processedCount: 0,
      committedCount: 0,
      skippedCount: 0,
      pendingCount: 0,
    };
  }
}

/**
 * Fold one invocation's outcomes into the seeded checkpoint. A record this
 * run already handled (own-run link) is skipped silently by the callers, so
 * each terminal outcome is counted exactly once across invocations.
 */
function mergeCheckpoint(
  seed: CommitCheckpoint,
  invocation: { committed: number; skipped: number; pending: number },
): CommitCheckpoint {
  return {
    processedCount:
      seed.processedCount +
      invocation.committed +
      invocation.skipped +
      invocation.pending,
    committedCount: seed.committedCount + invocation.committed,
    skippedCount: seed.skippedCount + invocation.skipped,
    pendingCount: seed.pendingCount + invocation.pending,
    updatedAt: Date.now(),
  };
}

/**
 * True when the R2-6 batch limit is reached and unhandled records remain.
 * Called at the TOP of a loop iteration: `handled` records already reached a
 * terminal outcome this invocation, `remaining` records (this one included)
 * are still unhandled.
 */
/** PL-SOURCE-DELTA: the compared values a fresh create wrote, kept on its link. */
function sourceBaseline(
  dataset: SourceDeltaDataset,
  record: object,
): { appliedValues: string; sourceVersion: string } {
  const values = SOURCE_FIELD_MAPS[dataset].fromSource(
    record as Record<string, unknown>,
  );
  return {
    appliedValues: JSON.stringify(values),
    sourceVersion: sourceVersionOf(values),
  };
}

/**
 * PL-SOURCE-DELTA tallies for records that already had a link from an earlier
 * run. The checkpoint still counts every such record as skipped (handled,
 * nothing new created); the result splits out the ones that changed.
 */
type DeltaTally = { updated: number; conflicted: number };

function countDelta(tally: DeltaTally, outcome: DeltaOutcome): void {
  if (outcome === "updated") tally.updated += 1;
  else if (outcome === "conflict") tally.conflicted += 1;
}

function deltaResult(skipped: number, tally: DeltaTally) {
  return {
    skipped: skipped - tally.updated - tally.conflicted,
    updated: tally.updated,
    conflicted: tally.conflicted,
  };
}

function batchLimitReached(
  maxRecords: number | undefined,
  handled: number,
  remaining: number,
): boolean {
  return maxRecords !== undefined && handled >= maxRecords && remaining > 0;
}

/**
 * Commit a venues ImportRun: parse caller-supplied TPP rows → materialize Venue
 * entities → idempotent ExternalRecordLinks → flip the run to completed via the
 * generated command. Per-record failures become pending_conflict links (visible
 * in the reconcile queue) rather than failing the whole run.
 */
export const commitImportRun = action({
  args: {
    importRunId: v.id("importRuns"),
    rawRows: v.array(v.any()),
    /**
     * R2-6 batch limit: process at most this many records to a terminal
     * outcome per invocation, persist the checkpoint, and return
     * stoppedEarly without completing the run. Chunked commits stay inside
     * action limits, and a worker that dies mid-loop leaves exactly this
     * durable state — re-invoking resumes by creating only the missing
     * records (own-run links skip; crash-window creates dedup through the
     * create command's idempotencyKey, which returns the original docId
     * with zero writes, so newer user edits are never replaced).
     */
    maxRecords: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CommitResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can commit imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "committing") {
      throw new ConvexError(
        `Import run must be in 'committing' status to commit, current: ${importRun.status}`,
      );
    }
    if (args.maxRecords !== undefined && args.maxRecords < 1) {
      throw new ConvexError("maxRecords must be at least 1 when provided.");
    }

    // PL-IMPORT-CANCEL (AC-056): the first commit keeps its rows in file
    // storage; a later Continue with no rows reads them back, so a run whose
    // worker stopped finishes without the browser that started it.
    let rawRows: unknown[] = args.rawRows;
    if (rawRows.length === 0 && importRun.sourceRowsStorageId) {
      rawRows = await readKeptRows(ctx, importRun.sourceRowsStorageId);
    } else if (rawRows.length > 0 && !importRun.sourceRowsStorageId) {
      const storageId = await ctx.storage.store(
        new Blob([JSON.stringify(rawRows)], { type: "application/json" }),
      );
      await ctx.runMutation(api.mutations.ImportRun_keepSourceRows, {
        docId: args.importRunId,
        sourceRowsStorageId: storageId,
      });
    }

    // R2-6 resume state, shared by every dataset branch below. Counting
    // rule: a link THIS run wrote was counted by the invocation that handled
    // it (the loop skip is silent for own-run links); foreign-run links,
    // fresh creates, and caught failures count in this invocation.
    const checkpoint = seedCheckpoint(importRun.commitCheckpoint);
    const stopEarly = async (
      parseErrors: number,
      invocation: { committed: number; skipped: number; pending: number },
    ): Promise<CommitResult> => {
      const merged = mergeCheckpoint(checkpoint, invocation);
      await ctx.runMutation(api.mutations.ImportRun_recordCommitCheckpoint, {
        docId: args.importRunId,
        commitCheckpoint: JSON.stringify(merged),
      });
      return {
        committed: invocation.committed,
        skipped: invocation.skipped,
        pending: invocation.pending,
        parseErrors,
        stoppedEarly: true,
        processedCount: merged.processedCount,
      };
    };
    const completeRun = async (invocation: {
      committed: number;
      skipped: number;
      pending: number;
    }): Promise<void> => {
      // Crash-window floor (review R2-14): a fault between a link write and
      // the checkpoint boundary loses that invocation's counts (resume skips
      // own-run links silently), so accumulated totals can finish below the
      // durable truth. Every terminal outcome this run produced is a live
      // ExternalRecordLink — count them in bounded pages across
      // transactions and never persist counts under that floor.
      let linked = 0;
      let countCursor: string | null = null;
      for (;;) {
        const page = (await ctx.runQuery(internal.importCommit.countRunLinks, {
          sourceImportRunId: args.importRunId,
          cursor: countCursor,
        })) as {
          count: number;
          isDone: boolean;
          continueCursor: string;
        };
        linked += page.count;
        if (page.isDone) break;
        countCursor = page.continueCursor;
      }
      const merged = mergeCheckpoint(checkpoint, invocation);
      const committedFloor = Math.max(
        merged.committedCount,
        linked - merged.pendingCount,
      );
      // The recovered processed total includes this invocation's pending
      // outcomes (review round 2): recovered resolved links + skipped +
      // pending is the durable lower bound.
      const reconciled: CommitCheckpoint = {
        ...merged,
        committedCount: committedFloor,
        processedCount: Math.max(
          merged.processedCount,
          committedFloor + merged.skippedCount + merged.pendingCount,
        ),
      };
      await ctx.runMutation(api.mutations.ImportRun_recordCommitCheckpoint, {
        docId: args.importRunId,
        commitCheckpoint: JSON.stringify(reconciled),
      });
      // recordCommitCheckpoint bumps the run's version — re-read so the
      // terminal flip passes OCC (the entry snapshot is now stale).
      const freshRun = await ctx.runQuery(
        internal.importCommit.loadCommitContext,
        { importRunId: args.importRunId },
      );
      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: freshRun ? freshRun.importRun.version : importRun.version,
      });
    };

    // PL-IMPORT-RESUME (AC-631): a person stopped this import (the run is no
    // longer committing). Start no further record; take back what this run
    // made that nobody has changed since — this worker may have linked one
    // more record after the stop, so it runs the same take-back the stop did.
    const stopIfStopped = async (): Promise<void> => {
      const still = await ctx.runQuery(internal.importCancel.runIsCommitting, {
        importRunId: args.importRunId,
      });
      if (still) return;
      const state = await ctx.runQuery(internal.importCancel.stopState, {
        importRunId: args.importRunId,
      });
      if (!state.stopped) {
        // Another worker finished it; this one adds nothing more.
        throw new ConvexError("This import already finished.");
      }
      await compensateStoppedRun(ctx, args.importRunId);
      throw new ConvexError(
        "This import was stopped. Nothing more was brought in.",
      );
    };

    // PL-ARCHIVE: a report-archive run with no rows to bring in finishes on
    // accounting alone. ImportRun_commit still refuses until every file is
    // accounted for and any report-list gap is explained; finishing creates
    // no records, and the run keeps each file's outcome visible.
    if (rawRows.length === 0 && importRun.archiveStorageId) {
      const none = { committed: 0, skipped: 0, pending: 0 };
      await completeRun(none);
      return {
        ...none,
        parseErrors: 0,
        processedCount: mergeCheckpoint(checkpoint, none).processedCount,
      };
    }

    // ponytail: a TPP contact (a person we cater for) → a person-type Client
    // account. We deliberately do NOT create a ClientContact here: that entity
    // requires a parent clientId (the TPP CompanyID → Capsule Client resolution
    // the venue module header defers as cross-dataset). A person-Client is the
    // top-level home for an individual client and mirrors the venue path
    // exactly — generated `Client_createViaRegister` (salesAccess-guarded,
    // PII-encrypting, `idempotencyKey`-deduped, returns `{docId}`), then an
    // idempotent ExternalRecordLink (recordType "contact" → capsuleEntity
    // "client"). The company/title are folded into notes (the full raw row is
    // also preserved on the link), so nothing is lost.
    if (importRun.datasetType === "contacts") {
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppContacts(rawRows as TppContactRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid contact records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;
      const delta: DeltaTally = { updated: 0, conflicted: 0 };
      // PL-SOURCE-IDENTITY (AC-058): a new client with the same name or email
      // as one Capsule has is still made on its own; only that record waits
      // on the match list for a person to say same or different.
      let clientPool: LookAlikeClient[] | null = null;
      const lookAlike = async (made: LookAlikeClient) => {
        clientPool ??= (await ctx.runQuery(
          api.queries.listClient,
          {},
        )) as LookAlikeClient[];
        const note = clientLookAlikeNote(made, clientPool);
        clientPool.push(made);
        return note;
      };
      for (const [index, contact] of parsed.records.entries()) {
        // R2-6 batch stop: halt before the next record once maxRecords
        // records reached a terminal outcome this invocation.
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        if (contact.company) {
          // A company row (TPP_COMPANY_MAPPINGS) becomes a company client.
          const outcome = await commitImportedCompany(ctx, {
            tenantId,
            sourceSystem,
            importRunId: args.importRunId,
            company: contact,
            rawSourceData: withSourceRow(
              contact,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            lookAlike,
          });
          if (outcome === "committed") committed += 1;
          else if (outcome === "skipped") skipped += 1;
          else if (outcome === "pending") pending += 1;
          continue;
        }
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "contact",
          externalId: contact.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized. A link THIS run wrote was counted by the
          // invocation that handled it, so a resume skips it silently (R2-6)
          // and checkpoint counts stay exact.
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          // PL-SOURCE-DELTA: an earlier run's record takes a changed source
          // row as a reviewed delta (never over a person's edit).
          const outcome = await reconcileExistingLink(ctx, {
            dataset: "contacts",
            link: existing,
            record: contact,
            rawSourceData: withSourceRow(
              contact,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            importRunId: args.importRunId,
          });
          if (outcome === "resumed") continue;
          countDelta(delta, outcome);
          skipped += 1;
          continue;
        }

        const idempotencyKey = `tenant-shared/import:${args.importRunId}:contact:${contact.externalId}`;
        const notes =
          [contact.title, contact.notes].filter(Boolean).join(" — ") ||
          undefined;
        // AC-275: the person's company, when the company row was imported.
        const companyName = contact.companyId
          ? await importedCompanyName(ctx, {
              tenantId,
              sourceSystem,
              companyId: contact.companyId,
            })
          : undefined;
        try {
          const created = await ctx.runMutation(
            api.mutations.Client_createViaRegister,
            {
              clientType: "person",
              givenName: contact.givenName,
              familyName: contact.familyName,
              companyName,
              email: contact.email,
              phone: contact.phone ?? contact.mobile,
              addressLine1: contact.addressLine1,
              city: contact.city,
              region: contact.region,
              postalCode: contact.postalCode,
              notes,
              idempotencyKey,
            },
          );
          const clientId: string = (created as { docId: string }).docId;
          // AC-063: the birthday goes on the client (Birthday List report).
          if (contact.birthday) {
            await ctx.runMutation(api.mutations.Client_setBirthday, {
              docId: clientId as Id<"clients">,
              birthday: contact.birthday,
              idempotencyKey: `${idempotencyKey}:birthday`,
            });
          }
          const lookAlikeNote = await lookAlike({
            _id: clientId,
            clientType: "person",
            givenName: contact.givenName,
            familyName: contact.familyName,
            email: contact.email,
          });
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "contact",
            externalId: contact.externalId,
            capsuleEntity: "client",
            capsuleId: clientId,
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              contact,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            ...(lookAlikeNote
              ? {
                  conflictStatus: "pending_conflict" as const,
                  resolutionNote: lookAlikeNote,
                  madeRecord: true,
                }
              : { conflictStatus: "resolved" as const }),
            ...sourceBaseline("contacts", contact),
          });
          // A look-alike is a made record: it counts as added, and its link
          // waits on the match list.
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. salesAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Client materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "contact",
            externalId: contact.externalId,
            capsuleEntity: "client",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              contact,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        ...deltaResult(skipped, delta),
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "events") {
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppEvents(rawRows as TppEventRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid event records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;
      const delta: DeltaTally = { updated: 0, conflicted: 0 };

      for (const [index, event] of (
        parsed.records as ParsedCapsuleEvent[]
      ).entries()) {
        // R2-6 batch stop (see the contacts branch).
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "event",
          externalId: event.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized (own-run links skip silently so resume
          // counts stay exact, R2-6).
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          // PL-SOURCE-DELTA (see the contacts branch).
          const outcome = await reconcileExistingLink(ctx, {
            dataset: "events",
            link: existing,
            record: event,
            rawSourceData: withSourceRow(
              event,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            importRunId: args.importRunId,
          });
          if (outcome === "resumed") continue;
          countDelta(delta, outcome);
          skipped += 1;
          continue;
        }

        // Cross-dataset resolution: a TPP Event's ClientID is an EXTERNAL id.
        // Resolve it to a Capsule client via the prior contacts import
        // (recordType "contact" → capsuleEntity "client"). The Event create
        // requires clientId, so an event whose client was not imported (e.g. a
        // TPP company id never imported as a contact) becomes a
        // pending_conflict link rather than fabricating a client — the
        // documented next slice (company→Client).
        // A ClientID may name a person contact or a company row (AC-275).
        const clientLink =
          (await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "contact",
            externalId: event.clientId,
          })) ??
          (await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: COMPANY_RECORD_TYPE,
            externalId: event.clientId,
          }));
        if (!clientLink || !clientLink.capsuleId) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              event,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: `Client not imported (external ${event.clientId}); import contacts first.`,
          });
          pending += 1;
          continue;
        }
        // AC-181: a client merged since its import hands its events to the
        // client it was merged into.
        const clientId: string = await ctx.runQuery(
          internal.importCommit.survivingClientId,
          { tenantId, clientId: clientLink.capsuleId },
        );

        // Venue is optional on Event; resolve if the TPP VenueID was imported.
        let venueId: string | undefined;
        if (event.venueId) {
          const venueLink = await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "venue",
            externalId: event.venueId,
          });
          venueId = venueLink?.capsuleId || undefined;
        }

        // The create command (Event_createViaPlanEngagement) requires several
        // non-empty fields the TPP row does not carry directly. Synthesize the
        // spec-faithful minimum so complete TPP events import cleanly;
        // incomplete rows fall to pending_conflict via the catch below.
        // ponytail: eventType is required + non-empty; surface the TPP EventType
        // slug (parseTppEvent folds EventType into occasionId) as free text,
        // else an honest placeholder. primaryContactName derives from the
        // imported contact's name (stored on its link), else a placeholder.
        // Headcount is guarded >= 1; dates require endsAt > startsAt (default a
        // 1h window when EndTime is absent).
        const eventType = event.occasionId || "Imported Event";
        let primaryContactName = "Imported Contact";
        try {
          const contact = JSON.parse(clientLink.rawSourceData || "{}") as {
            givenName?: string;
            familyName?: string;
            company?: { name?: string };
          };
          const name =
            [contact.givenName, contact.familyName].filter(Boolean).join(" ") ||
            contact.company?.name ||
            "";
          if (name) primaryContactName = name;
        } catch {
          // keep placeholder
        }
        const expectedHeadcount = Math.max(1, event.expectedHeadcount ?? 1);
        if (!event.startsAt) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              event,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: "Event is missing a start date (EventDate).",
          });
          pending += 1;
          continue;
        }
        const startsAt = event.startsAt;
        const endsAt =
          !event.endsAt || event.endsAt <= startsAt
            ? startsAt + 3_600_000
            : event.endsAt;
        const budgetAmount = Math.max(0, event.budgetAmount ?? 0);
        const quotedPrice = Math.max(0, event.quotedRevenue ?? 0);

        // Service style (AC-064): use the matching Capsule style; an unknown
        // one never blocks the event — it waits on the matching screen.
        const styleMatch = event.serviceStyleId
          ? await ctx.runQuery(internal.importServiceStyle.matchServiceStyle, {
              tenantId,
              sourceSystem,
              code: event.serviceStyleId,
            })
          : null;

        const idempotencyKey = `tenant-shared/import:${args.importRunId}:event:${event.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.Event_createViaPlanEngagement,
            {
              clientId,
              title: event.title,
              eventType,
              startsAt,
              endsAt,
              expectedHeadcount,
              primaryContactName,
              budgetAmount,
              quotedPrice,
              venueId,
              serviceStyleId: styleMatch?._id,
              serviceStyleName: styleMatch?.name,
              venueName: event.venueName,
              venueAddress: event.venueAddress,
              accessibilityNeeds: event.accessibilityNeeds,
              operationalRequirements: eventRequirementsText({
                ...event,
              }),
              idempotencyKey,
            },
          );
          const eventId: string = (created as { docId: string }).docId;
          // AC-024: the event's files, attached BEFORE the link (the pack-list
          // item shape). A worker that dies between files leaves no link, so
          // the resume re-opens the same event and each per-file key returns
          // the file already attached with zero writes — a file a person
          // removed in the meantime stays removed.
          const fileErrors = await attachImportedEventFiles(ctx, {
            tenantId,
            importRunId: args.importRunId,
            externalId: event.externalId,
            eventId,
            files: event.files ?? [],
          });
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: eventId,
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              event,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "resolved",
            ...(fileErrors.length > 0
              ? {
                  resolutionNote: `Some files were not added: ${fileErrors.join("; ")}`,
                }
              : {}),
            ...sourceBaseline("events", event),
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. missing required field, salesAccess
          // denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Event materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              event,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
        // One matching-screen item per unknown old style; the event itself
        // imports either way.
        if (event.serviceStyleId && !styleMatch) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: SERVICE_STYLE_RECORD_TYPE,
            externalId: event.serviceStyleId,
            capsuleEntity: SERVICE_STYLE_RECORD_TYPE,
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify({
              serviceStyle: event.serviceStyleId,
            }),
            conflictStatus: "pending_conflict",
            resolutionNote: `Service style "${event.serviceStyleId.replace(/_/g, " ")}" is not in your service styles. Match it to one; the imported events that use it get that style.`,
          });
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        ...deltaResult(skipped, delta),
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "leads") {
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppLeads(rawRows as TppLeadRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid lead records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;
      const delta: DeltaTally = { updated: 0, conflicted: 0 };

      for (const [index, lead] of (
        parsed.records as ParsedCapsuleLead[]
      ).entries()) {
        // R2-6 batch stop (see the contacts branch).
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "lead",
          externalId: lead.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized (own-run links skip silently so resume
          // counts stay exact, R2-6).
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          // PL-SOURCE-DELTA (see the contacts branch).
          const outcome = await reconcileExistingLink(ctx, {
            dataset: "leads",
            link: existing,
            record: lead,
            rawSourceData: withSourceRow(
              lead,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            importRunId: args.importRunId,
          });
          if (outcome === "resumed") continue;
          countDelta(delta, outcome);
          skipped += 1;
          continue;
        }

        // ponytail: a TPP opportunity/pipeline row → a company-type Lead. The
        // Lead is the PRE-client inquiry (clientId is optional, set only on
        // conversion), so — unlike events — NO cross-dataset client resolution
        // is needed. The external TPP ClientID + the mapped stage are preserved
        // on the link's rawSourceData (the stage is NOT applied: `capture`
        // hardcodes stage "new" with no stage arg). Linking the lead to a
        // Capsule Client is the conversion workflow (stageConversion →
        // confirmConversion), a separate operator action.
        const idempotencyKey = `tenant-shared/import:${args.importRunId}:lead:${lead.externalId}`;
        const notes = lead.clientId ? `TPP client ${lead.clientId}` : undefined;
        try {
          const created = await ctx.runMutation(
            api.mutations.Lead_createViaCapture,
            {
              leadType: "company",
              source: lead.source,
              estimatedValue: lead.estimatedValue,
              companyName: lead.opportunityName,
              probability: lead.probability,
              notes,
              idempotencyKey,
            },
          );
          const leadId: string = (created as { docId: string }).docId;
          // AC-276: the old stage, event date and close date go on the lead
          // itself (a close date means the deal is closed), before the link.
          await ctx.runMutation(api.mutations.Lead_recordSourceHistory, {
            docId: leadId as Id<"leads">,
            stage: lead.stage,
            sourceStage: lead.rawStage,
            eventDate: lead.eventDate,
            closedAt: lead.closeDate,
            idempotencyKey: `${idempotencyKey}:history`,
          });
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "lead",
            externalId: lead.externalId,
            capsuleEntity: "lead",
            capsuleId: leadId,
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              lead,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "resolved",
            ...sourceBaseline("leads", lead),
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. salesAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Lead materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "lead",
            externalId: lead.externalId,
            capsuleEntity: "lead",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              lead,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        ...deltaResult(skipped, delta),
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "payments") {
      // ponytail: payments materialize as reconciliation-reference LINKS, NOT
      // Payment entities (spec §6.4). Payment.record requires a Capsule invoice
      // + client that NO import produces (there is no invoice dataset), and §6.4
      // treats imported payments as references matched (Payment.markMatched)
      // against EXISTING Capsule payments. So each TPP payment becomes a
      // pending_conflict ExternalRecordLink (recordType "payment",
      // capsuleEntity "payment", capsuleId "") awaiting a reconciliation match
      // in the queue. conflictStatus "pending_conflict" is the CORRECT
      // "awaiting match" state here — not a creation failure — so a staged link
      // counts as `committed` (the link IS the artifact this dataset produces).
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppPayments(rawRows as TppPaymentRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid payment records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const [index, payment] of (
        parsed.records as ParsedCapsulePayment[]
      ).entries()) {
        // R2-6 batch stop (see the contacts branch).
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        // Idempotent skip: an existing ACTIVE link means this payment reference
        // is already staged (or already matched). The link IS the artifact, so
        // ANY active link — matched or not — is a no-op skip (re-runs don't
        // re-stage). findLink excludes superseded links, so a reverted run
        // re-stages cleanly.
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "payment",
          externalId: payment.externalId,
        });
        if (existing) {
          // Already staged — no-op skip. A link THIS run wrote was counted
          // by the invocation that staged it (R2-6 resume).
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          skipped += 1;
          continue;
        }

        // Cross-dataset context (optional, aids later matching): resolve the
        // TPP EventID → Capsule event from the prior events import. The natural
        // Capsule match target is an invoice/payment, which is why §6.4 keys
        // these records on event/client reference + reconciliation state. The
        // external InvoiceID is preserved raw (no invoice import → not
        // resolvable to a Capsule invoice).
        let resolvedEventNote: string | null = null;
        if (payment.eventId) {
          const eventLink = await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: payment.eventId,
          });
          if (eventLink?.capsuleId) {
            resolvedEventNote = `Capsule event ${eventLink.capsuleId}`;
          } else if (eventLink) {
            resolvedEventNote = `external event ${payment.eventId} (imported but unresolved)`;
          }
        }
        // AC-084: only money moving on its own waits for a match; the same
        // accounting transaction seen in an overlapping report counts once.
        let sameMoneyAs: string | null = null;
        if (payment.movesMoney && payment.providerTransactionId) {
          const counted = await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "payment_transaction",
            externalId: payment.providerTransactionId,
          });
          const countedAs = counted
            ? (JSON.parse(counted.rawSourceData ?? "{}").paymentId as string)
            : null;
          if (countedAs && countedAs !== payment.externalId)
            sameMoneyAs = countedAs;
        }
        const waitsForMatch = payment.movesMoney && !sameMoneyAs;
        const label = FINANCIAL_ROW_LABEL[payment.rowClass];
        const note = [
          sameMoneyAs
            ? `Same money as payment ${sameMoneyAs} (same accounting transaction ${payment.providerTransactionId}) — counted once, kept for the record`
            : waitsForMatch
              ? `Imported TPP ${label} — reconciliation reference (match via markMatched on a Capsule payment)`
              : `Imported TPP ${label} — reference only, not money of its own, not counted`,
          payment.invoiceId
            ? `external invoice ${payment.invoiceId} (no invoice import)`
            : null,
          resolvedEventNote ??
            (payment.eventId ? `external event ${payment.eventId}` : null),
          payment.recordedAt
            ? `recorded ${new Date(payment.recordedAt).toISOString()}`
            : null,
        ]
          .filter(Boolean)
          .join(" — ");

        // The transaction marker goes first: a run that stops between the
        // two writes resumes to the same result.
        if (waitsForMatch && payment.providerTransactionId)
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "payment_transaction",
            externalId: payment.providerTransactionId,
            capsuleEntity: "payment",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify({ paymentId: payment.externalId }),
            conflictStatus: "resolved",
            resolutionNote: `Accounting transaction counted once, as payment ${payment.externalId}`,
          });
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "payment",
          externalId: payment.externalId,
          capsuleEntity: "payment",
          capsuleId: "",
          sourceImportRunId: args.importRunId,
          rawSourceData: withSourceRow(
            payment,
            rawRows[parsed.sourceIndexes[index]!],
          ),
          conflictStatus: waitsForMatch ? "pending_conflict" : "resolved",
          resolutionNote: note,
        });
        committed += 1;
      }

      if (committed === 0 && skipped === 0) {
        // parsed.records.length > 0 is enforced above, so this is defensive.
        throw new ConvexError("No payment references staged.");
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "menus") {
      // ponytail: each TPP dish-catalog row → a Dish entity (the menu catalog
      // item). The TPP dishes export (work/dishes.csv) has no menu grouping, no
      // external id, and EMPTY price columns, so a Dish per row is the faithful
      // one-entity mapping (mirrors venues/contacts/events/leads). Dish has no
      // price field, so price_per_person / cost_per_person are preserved on the
      // link's rawSourceData (captured verbatim from the source — they are empty
      // in the real feed) rather than inventing a Menu+MenuDish pricing graph.
      // Menu/MenuDish assembly (to make prices queryable) is a documented
      // follow-up if a TPP export with real prices arrives. The dish name is
      // slugified into the link externalId (no id column in the feed).
      // Dish_createViaIntroduce is kitchenAccess-guarded (NOT salesAccess like
      // the other branches), so a role with importAccess but not kitchenAccess
      // sees every dish land as pending_conflict (managers/admins/owners hold
      // both); portionSize is parsed from free text and defaults to 1.
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppMenus(rawRows as TppMenuRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid menu records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;
      const delta: DeltaTally = { updated: 0, conflicted: 0 };

      for (const [index, menu] of (
        parsed.records as ParsedCapsuleMenu[]
      ).entries()) {
        // R2-6 batch stop (see the contacts branch).
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "menu",
          externalId: menu.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized (own-run links skip silently so resume
          // counts stay exact, R2-6).
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          // PL-SOURCE-DELTA (see the contacts branch).
          const outcome = await reconcileExistingLink(ctx, {
            dataset: "menus",
            link: existing,
            record: menu,
            rawSourceData: withSourceRow(
              menu,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            importRunId: args.importRunId,
          });
          if (outcome === "resumed") continue;
          countDelta(delta, outcome);
          skipped += 1;
          continue;
        }

        const idempotencyKey = `tenant-shared/import:${args.importRunId}:menu:${menu.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.Dish_createViaIntroduce,
            {
              name: menu.name,
              portionSize: menu.portionSize,
              portionUnit: menu.portionUnit,
              description: menu.description,
              category: menu.category,
              serviceStyle: menu.serviceStyle,
              dietaryTags: menu.dietaryTags,
              allergenSummary: menu.allergenSummary,
              idempotencyKey,
            },
          );
          const dishId: string = (created as { docId: string }).docId;
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "menu",
            externalId: menu.externalId,
            // AC-180: the record is a Dish, so the link says so.
            capsuleEntity: "dish",
            capsuleId: dishId,
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              menu,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "resolved",
            ...sourceBaseline("menus", menu),
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. kitchenAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Dish materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "menu",
            externalId: menu.externalId,
            capsuleEntity: "dish",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              menu,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        ...deltaResult(skipped, delta),
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "pack_list") {
      // ponytail: §6.3 browser-extracted Pack Lists. TPP has no bulk export for
      // per-event equipment pack lists, so each source row is one event's
      // browser-extracted pack list (source event id + page/version + extraction
      // time + nested items[text, qty, unit, group]). The source event is
      // resolved to a Capsule Event via the prior events import (recordType
      // "event"); one PackList is opened for it and each item is added as a
      // PackListItem. Items with no Equipment/Dish mapping land as
      // description-only free-text lines (dishId null) per §6.3. Unmapped unit
      // text defaults to "each" (raw unit preserved on the link). Idempotent
      // per-event (externalId = sourceEventId): a re-run skips an already-linked
      // event. PackList_createViaOpen is logisticsAccess-guarded, so a role with
      // importAccess but not logisticsAccess sees the row land as pending_conflict.
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppPackLists(rawRows as TppPackListRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid pack-list records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const [index, packList] of (
        parsed.records as ParsedCapsulePackList[]
      ).entries()) {
        // R2-6 batch stop (see the contacts branch).
        if (
          batchLimitReached(
            args.maxRecords,
            committed + skipped + pending,
            parsed.records.length - index,
          )
        ) {
          return await stopEarly(parsed.errors.length, {
            committed,
            skipped,
            pending,
          });
        }
        await stopIfStopped();
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "pack_list",
          externalId: packList.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized — idempotent skip (own-run links skip
          // silently so resume counts stay exact, R2-6).
          if (existing.sourceImportRunId === args.importRunId) {
            continue;
          }
          skipped += 1;
          continue;
        }

        // Cross-dataset resolution: the source event id is EXTERNAL — resolve it
        // to a Capsule Event via the prior events import (recordType "event").
        // PackList belongsTo Event, so an event that was not imported has no
        // target; stage as pending_conflict rather than fabricating an event —
        // mirrors how events resolve their external client/venue.
        const eventLink = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "event",
          externalId: packList.sourceEventId,
        });
        if (!eventLink || !eventLink.capsuleId) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              packList,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: `Source event not imported (external ${packList.sourceEventId}); import events first.`,
          });
          pending += 1;
          continue;
        }
        const eventId: string = eventLink.capsuleId;

        const idempotencyKey = `tenant-shared/import:${args.importRunId}:pack_list:${packList.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.PackList_createViaOpen,
            {
              eventId,
              name: packList.name,
              idempotencyKey,
            },
          );
          const packListId: string = (created as { docId: string }).docId;

          // Add each item. Per-item failures (e.g. a bad unit slipping through)
          // are recorded as extraction errors but do NOT fail the whole pack
          // list — partial import is faithful to §6.3 ("records … extraction
          // errors") and the PackList already exists.
          const itemImportErrors: string[] = [];
          let itemsAdded = 0;
          for (const [itemIndex, item] of packList.items.entries()) {
            try {
              await ctx.runMutation(
                api.mutations.PackListItem_createViaAddItem,
                {
                  packListId,
                  description: item.description,
                  requiredQuantity: item.requiredQuantity,
                  unit: item.unit,
                  // Deterministic per-item key: a retried/overlapping commit
                  // re-opens the SAME PackList (idempotencyKey above) — without
                  // a per-item key it would append duplicate items, breaking the
                  // §6.3 idempotent-import requirement. Run-scoped to match the
                  // PackList/Dish create-key convention; cross-run dedup is the
                  // pack-list link check's job (findLink above).
                  idempotencyKey: `tenant-shared/import:${args.importRunId}:pack_list:${packList.externalId}:item:${itemIndex}`,
                },
              );
              itemsAdded += 1;
            } catch (itemCause) {
              itemImportErrors.push(
                `${item.description}: ${itemCause instanceof Error ? itemCause.message : "add item failed"}`,
              );
            }
          }

          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: packListId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify({
              ...packList,
              itemsAdded,
              itemImportErrors,
            }),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. logisticsAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Pack list materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: withSourceRow(
              packList,
              rawRows[parsed.sourceIndexes[index]!],
            ),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      // R2-6: persist the final checkpoint totals, then flip to completed
      // with a fresh version (recordCommitCheckpoint bumps it).
      await completeRun({ committed, skipped, pending });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
        processedCount: mergeCheckpoint(checkpoint, {
          committed,
          skipped,
          pending,
        }).processedCount,
      };
    }

    if (importRun.datasetType === "stock") {
      // Opening stock count sheets (PL-OPENING-STOCK): each row is staged as
      // an OpeningStockRecord for review; on-hand stock is never written here.
      if (rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const result = await commitStockRows(ctx, {
        importRunId: args.importRunId,
        tenantId,
        sourceSystem: importRun.sourceSystem,
        rawRows: rawRows,
        maxRecords: args.maxRecords,
      });
      const invocation = {
        committed: result.committed,
        skipped: result.skipped,
        pending: result.pending,
      };
      if (result.stoppedEarly) {
        return await stopEarly(result.parseErrors, invocation);
      }
      await completeRun(invocation);
      return {
        ...invocation,
        parseErrors: result.parseErrors,
        processedCount: mergeCheckpoint(checkpoint, invocation).processedCount,
      };
    }

    // ImportDatasetType is a closed union (contacts/events/leads/payments/menus/
    // pack_list/stock/venues); the seven branches above each return, so TS narrows
    // importRun.datasetType to "venues" here — this fall-through is exhaustive.
    // A future member added without a branch would fall through to venue parsing
    // and fail loudly ("No valid venue records parsed") rather than misroute.
    if (rawRows.length === 0) {
      throw new ConvexError("No source rows provided — nothing to commit.");
    }

    const parsed = parseTppVenues(rawRows as TppVenueRecord[]);
    if (parsed.records.length === 0) {
      // Non-empty input that yields zero valid records (all rows failed to
      // parse) must NOT silently flip the run to completed.
      throw new ConvexError(
        `No valid venue records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
      );
    }
    const sourceSystem = importRun.sourceSystem;
    let committed = 0;
    let skipped = 0;
    let pending = 0;
    const delta: DeltaTally = { updated: 0, conflicted: 0 };
    // PL-SOURCE-IDENTITY (AC-058): same name, or same address under a new
    // name (a renamed venue), waits on the match list; nothing is joined.
    let venuePool: LookAlikeVenue[] | null = null;

    for (const [index, venue] of parsed.records.entries()) {
      // R2-6 batch stop (see the contacts branch).
      if (
        batchLimitReached(
          args.maxRecords,
          committed + skipped + pending,
          parsed.records.length - index,
        )
      ) {
        return await stopEarly(parsed.errors.length, {
          committed,
          skipped,
          pending,
        });
      }
      await stopIfStopped();
      const existing = await ctx.runQuery(internal.importCommit.findLink, {
        tenantId,
        sourceSystem,
        recordType: "venue",
        externalId: venue.externalId,
      });
      if (existing && existing.capsuleId) {
        // Already materialized (own-run links skip silently so resume
        // counts stay exact, R2-6).
        if (existing.sourceImportRunId === args.importRunId) {
          continue;
        }
        // PL-SOURCE-DELTA (see the contacts branch).
        const outcome = await reconcileExistingLink(ctx, {
          dataset: "venues",
          link: existing,
          record: venue,
          rawSourceData: withSourceRow(
            venue,
            rawRows[parsed.sourceIndexes[index]!],
          ),
          importRunId: args.importRunId,
        });
        if (outcome === "resumed") continue;
        countDelta(delta, outcome);
        skipped += 1;
        continue;
      }

      const idempotencyKey = `tenant-shared/import:${args.importRunId}:venue:${venue.externalId}`;
      try {
        const created = await ctx.runMutation(
          api.mutations.Venue_createViaRegister,
          {
            name: venue.name,
            venueType: venue.venueType ?? "other",
            capacity: venue.capacity ?? 0,
            addressLine1: venue.addressLine1,
            city: venue.city,
            region: venue.region,
            postalCode: venue.postalCode,
            contactName: venue.contactName,
            contactEmail: venue.contactEmail,
            contactPhone: venue.contactPhone,
            accessNotes: venue.accessNotes,
            cateringNotes: venue.cateringNotes,
            loadInInstructions: venue.loadInInstructions,
            logisticsNotes: venue.logisticsNotes,
            idempotencyKey,
          },
        );
        const venueId: string = (created as { docId: string }).docId;
        venuePool ??= (await ctx.runQuery(
          api.queries.listVenue,
          {},
        )) as LookAlikeVenue[];
        const made: LookAlikeVenue = {
          _id: venueId,
          name: venue.name,
          addressLine1: venue.addressLine1,
          postalCode: venue.postalCode,
        };
        const lookAlikeNote = venueLookAlikeNote(made, venuePool);
        venuePool.push(made);
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: venueId,
          sourceImportRunId: args.importRunId,
          rawSourceData: withSourceRow(
            venue,
            rawRows[parsed.sourceIndexes[index]!],
          ),
          ...(lookAlikeNote
            ? {
                conflictStatus: "pending_conflict" as const,
                resolutionNote: lookAlikeNote,
                madeRecord: true,
              }
            : { conflictStatus: "resolved" as const }),
          ...sourceBaseline("venues", venue),
        });
        // A look-alike is a made record: it counts as added (see contacts).
        committed += 1;
      } catch (cause) {
        // Per-record failure (e.g. eventManageAccess denied) → review queue.
        const note =
          cause instanceof Error
            ? cause.message
            : "Venue materialization failed";
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: "",
          sourceImportRunId: args.importRunId,
          rawSourceData: withSourceRow(
            venue,
            rawRows[parsed.sourceIndexes[index]!],
          ),
          conflictStatus: "pending_conflict",
          resolutionNote: note,
        });
        pending += 1;
      }
    }

    if (committed === 0 && pending > 0) {
      throw new ConvexError(
        `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
      );
    }

    // Flip the run to completed via the generated command (transition guard +
    // ImportRunCommitted event + OCC). R2-6: persist the final checkpoint
    // totals first, then flip with a fresh version (recordCommitCheckpoint
    // bumps it, so the entry snapshot would fail OCC).
    await completeRun({ committed, skipped, pending });

    return {
      committed,
      ...deltaResult(skipped, delta),
      pending,
      parseErrors: parsed.errors.length,
      processedCount: mergeCheckpoint(checkpoint, {
        committed,
        skipped,
        pending,
      }).processedCount,
    };
  },
});

export type RevertResult = { rolledBack: number };

/**
 * Revert a completed ImportRun: supersede every link it created. Imported Venue
 * entities are left in place (an event may already reference one); superseding
 * the link removes the active mapping and surfaces the records for operator
 * deactivation. Then flip the run to reverted via the generated command.
 */
export const revertImportRun = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<RevertResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can revert imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "completed") {
      throw new ConvexError(
        `Only completed imports can be reverted, current: ${importRun.status}`,
      );
    }

    // Page through ALL active links the run created. linksForRun returns only
    // non-superseded links; superseding a batch drops those rows from the next
    // query, so this terminates and fully reverts even a >500-link run.
    let rolledBack = 0;
    for (;;) {
      const batch = await ctx.runQuery(internal.importCommit.linksForRun, {
        sourceImportRunId: args.importRunId,
      });
      if (batch.length === 0) break;
      for (const link of batch) {
        await ctx.runMutation(internal.importCommit.supersedeLink, {
          linkId: link._id,
          version: link.version,
        });
        rolledBack += 1;
      }
      if (batch.length < 500) break; // last partial page
    }

    await ctx.runMutation(api.mutations.ImportRun_revert, {
      docId: args.importRunId,
      version: importRun.version,
    });

    return { rolledBack };
  },
});
