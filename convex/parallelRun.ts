// Authored seam: the daily TPP vs Capsule comparison (spec §6.5, AC-285,
// AC-286, AC-632). Once a day, every TPP event Capsule knows by its link is
// compared with the Capsule event the link names (src/lib/parallelRunCompare.ts
// holds the rules). Each field that differs is one ParallelRunDifference a
// manager can give to a person and settle; each run leaves one
// ParallelRunComparison with both sides' totals. The run books the next one a
// day later and stops booking once the company has switched from TPP (go).

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import { cutoverDecisionOf } from "./lib/cutoverGate";
import { canRead } from "./search";
import {
  addCapsuleEvent,
  addTppEvent,
  compareEventPair,
  newSummary,
  nextDifferenceStatus,
  reconcileVerdict,
  tppEventFromRaw,
  type CapsuleEventSide,
  type ComparisonSummary,
  type IdentityLookups,
} from "../src/lib/parallelRunCompare";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Events from 30 days back onward: the ones both systems still work on. */
const WINDOW_MS = 30 * DAY_MS;
const LIST_LIMIT = 500;

function personName(person: Doc<"people"> | null): string | undefined {
  if (!person || person.deletedAt != null) return undefined;
  return `${person.givenName} ${person.familyName}`.trim() || undefined;
}

async function capsuleSide(
  ctx: MutationCtx,
  tenantId: string,
  event: Doc<"events">,
): Promise<CapsuleEventSide> {
  const owner = event.assignedToId
    ? await ctx.db.get(event.assignedToId)
    : null;
  return {
    id: String(event._id),
    title: event.title,
    removed: event.deletedAt != null || event.tenantId !== tenantId,
    startsAt: event.startsAt,
    expectedHeadcount: event.expectedHeadcount,
    quotedPrice: event.quotedPrice,
    stage: String(event.stage),
    assignedToId: event.assignedToId ? String(event.assignedToId) : null,
    assignedToName:
      owner && owner.tenantId === tenantId ? personName(owner) : undefined,
    eventType: event.eventType,
    serviceStyleName: event.serviceStyleName,
    venueId: event.venueId ? String(event.venueId) : null,
    venueName: event.venueName,
  };
}

/** Rows read in one batch, and how many rows one run works before it books its next part. */
const BATCH_ROWS = 100;
const RUN_ROWS = 400;

type ComparisonWindow = { from: number; to: number | null };

/** The last row a batch worked: its _creationTime and every id worked at that time. */
type RowCursor = { time: number; ids: string[] } | null;

/**
 * Where a comparison is. One run cannot read every TPP event, every Capsule
 * event and every difference of a company (the per-call read limit), so the
 * work goes in batches by creation time and a run that runs out of room
 * books its next part with this state.
 */
interface ComparisonProgress {
  stage: "links" | "events" | "open" | "done";
  after: RowCursor;
  summary: ComparisonSummary;
  comparedCount: number;
  openCount: number;
  newCount: number;
  clearedCount: number;
  /** Differences still open for events inside the window. */
  openInWindow: number;
}

const modeValidator = v.union(
  v.object({ kind: v.literal("daily"), book: v.boolean() }),
  v.object({ kind: v.literal("period"), from: v.number(), to: v.number() }),
);
type ComparisonMode =
  | { kind: "daily"; book: boolean }
  | { kind: "period"; from: number; to: number };

function windowOf(mode: ComparisonMode, now: number): ComparisonWindow {
  return mode.kind === "period"
    ? { from: mode.from, to: mode.to }
    : { from: now - WINDOW_MS, to: null };
}

function startProgress(window: ComparisonWindow): ComparisonProgress {
  return {
    stage: "links",
    after: null,
    summary: newSummary(window.from, window.to),
    comparedCount: 0,
    openCount: 0,
    newCount: 0,
    clearedCount: 0,
    openInWindow: 0,
  };
}

/** The rows of a batch not worked yet, and the cursor after the batch. */
function pastCursor<T extends { _id: string; _creationTime: number }>(
  rows: T[],
  after: RowCursor,
): { fresh: T[]; next: RowCursor } {
  const worked = new Set(after?.ids ?? []);
  const fresh = rows.filter(
    (row) =>
      !(
        after &&
        row._creationTime === after.time &&
        worked.has(String(row._id))
      ),
  );
  const last = rows[rows.length - 1];
  if (!last) return { fresh, next: after };
  return {
    fresh,
    next: {
      time: last._creationTime,
      ids: rows
        .filter((row) => row._creationTime === last._creationTime)
        .map((row) => String(row._id)),
    },
  };
}

const isLiveTppLink = (link: Doc<"externalRecordLinks">) =>
  link.sourceSystem === "tpp_legacy" &&
  link.deletedAt == null &&
  link.conflictStatus !== "superseded";

/** TPP ids an earlier import matched to Capsule venues and people. */
async function identityLookups(
  ctx: MutationCtx,
  tenantId: string,
): Promise<IdentityLookups> {
  // Venues and people are small lists; they are read whole each run.
  const read = await Promise.all([
    ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", "venue"),
      )
      .collect(),
    ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_capsuleEntity", (q) =>
        q.eq("tenantId", tenantId).eq("capsuleEntity", "person"),
      )
      .collect(),
  ]);
  const links = [
    ...new Map(read.flat().map((link) => [String(link._id), link])).values(),
  ].filter(isLiveTppLink);
  const venueByTpp = new Map<string, string>();
  const personByTpp = new Map<string, { id: string; name: string }>();
  for (const link of links) {
    if (!link.capsuleId) continue;
    if (link.recordType === "venue")
      venueByTpp.set(link.externalId, link.capsuleId);
    if (link.capsuleEntity === "person") {
      const id = ctx.db.normalizeId("people", link.capsuleId);
      const person = id ? await ctx.db.get(id) : null;
      const name =
        person && person.tenantId === tenantId ? personName(person) : undefined;
      if (name) personByTpp.set(link.externalId, { id: link.capsuleId, name });
    }
  }
  return {
    salesperson: (tppId) => personByTpp.get(tppId),
    venue: (tppId) => venueByTpp.get(tppId),
  };
}

/** Compare one TPP event link and settle its saved differences. */
async function compareLink(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  window: ComparisonWindow,
  lookups: IdentityLookups,
  link: Doc<"externalRecordLinks">,
  progress: ComparisonProgress,
): Promise<void> {
  const tpp = tppEventFromRaw(link.rawSourceData);
  if (!tpp || tpp.startsAt == null) return;
  if (!(
    tpp.startsAt >= window.from &&
    (window.to == null || tpp.startsAt <= window.to)
  ))
    return;
  addTppEvent(progress.summary.tpp, tpp, lookups);
  if (!link.capsuleId) {
    // Still on the match-up page; nothing to compare yet.
    progress.summary.onlyInTpp += 1;
    return;
  }
  const eventId = ctx.db.normalizeId("events", link.capsuleId);
  const event = eventId ? await ctx.db.get(eventId) : null;
  const capsule = event ? await capsuleSide(ctx, tenantId, event) : null;
  progress.comparedCount += 1;
  const found = new Map<string, { source: string; mine: string }>();
  for (const difference of compareEventPair(tpp, capsule, lookups)) {
    found.set(difference.field, {
      source: difference.sourceValue,
      mine: difference.capsuleValue,
    });
  }

  const saved = (
    await ctx.db
      .query("parallelRunDifferences")
      .withIndex("by_externalRecordLinkId", (q) =>
        q.eq("externalRecordLinkId", link._id),
      )
      .collect()
  ).filter((row) => row.tenantId === tenantId && row.deletedAt == null);
  const seen = new Set<string>();
  for (const row of saved) {
    seen.add(row.field);
    const today = found.get(row.field);
    const status = nextDifferenceStatus(
      row.status,
      today != null &&
        today.source === row.sourceValue &&
        today.mine === row.capsuleValue,
      today != null,
    );
    if (today && status === "open") progress.openInWindow += 1;
    if (status === "cleared" && row.status === "cleared") continue;
    if (status === "cleared") progress.clearedCount += 1;
    const reopened = status === "open" && row.status !== "open";
    await ctx.db.patch(row._id, {
      status,
      ...(today
        ? {
            sourceValue: today.source,
            capsuleValue: today.mine,
            capsuleId: link.capsuleId,
            lastSeenAt: now,
          }
        : {}),
      ...(reopened ? { resolvedByUserId: null, resolvedAt: null } : {}),
      updatedAt: now,
      version: row.version + 1,
    });
  }
  for (const [field, today] of found) {
    if (seen.has(field)) continue;
    await ctx.db.insert("parallelRunDifferences", {
      tenantId,
      deletedAt: null,
      externalRecordLinkId: link._id,
      externalId: link.externalId,
      capsuleEntity: link.capsuleEntity,
      capsuleId: link.capsuleId,
      field,
      sourceValue: today.source,
      capsuleValue: today.mine,
      status: "open",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    progress.newCount += 1;
    progress.openInWindow += 1;
  }
}

/** True when a live TPP event link names this Capsule event. */
async function hasTppLink(
  ctx: MutationCtx,
  tenantId: string,
  eventId: string,
): Promise<boolean> {
  for await (const link of ctx.db
    .query("externalRecordLinks")
    .withIndex("by_tenantId_and_capsuleId", (q) =>
      q.eq("tenantId", tenantId).eq("capsuleId", eventId),
    )) {
    if (link.recordType === "event" && isLiveTppLink(link)) return true;
  }
  return false;
}

/**
 * Work the comparison as far as one run may: TPP event links first, then the
 * Capsule events in the window, then the count of open differences.
 */
async function workComparison(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  window: ComparisonWindow,
  progress: ComparisonProgress,
): Promise<ComparisonProgress> {
  const inWindow = (at: number) =>
    at >= window.from && (window.to == null || at <= window.to);
  let lookups: IdentityLookups | null = null;
  let room = RUN_ROWS;
  while (progress.stage !== "done" && room > 0) {
    const after = progress.after;
    const want = BATCH_ROWS + (after?.ids.length ?? 0);
    const since = after?.time ?? 0;
    if (progress.stage === "links") {
      const rows = await ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_recordType", (q) =>
          q
            .eq("tenantId", tenantId)
            .eq("recordType", "event")
            .gte("_creationTime", since),
        )
        .take(want);
      const { fresh, next } = pastCursor(rows, after);
      lookups ??= await identityLookups(ctx, tenantId);
      for (const link of fresh) {
        if (!isLiveTppLink(link)) continue;
        await compareLink(ctx, tenantId, now, window, lookups, link, progress);
      }
      room -= fresh.length;
      progress.after = next;
      if (rows.length < want) {
        progress.stage = "events";
        progress.after = null;
      }
    } else if (progress.stage === "events") {
      const rows = await ctx.db
        .query("events")
        .withIndex("by_tenantId", (q) =>
          q.eq("tenantId", tenantId).gte("_creationTime", since),
        )
        .take(want);
      const { fresh, next } = pastCursor(rows, after);
      for (const event of fresh) {
        if (event.deletedAt != null) continue;
        if (event.startsAt == null || !inWindow(event.startsAt)) continue;
        addCapsuleEvent(
          progress.summary.capsule,
          await capsuleSide(ctx, tenantId, event),
        );
        if (!(await hasTppLink(ctx, tenantId, String(event._id))))
          progress.summary.onlyInCapsule += 1;
      }
      room -= fresh.length;
      progress.after = next;
      if (rows.length < want) {
        progress.stage = "open";
        progress.after = null;
      }
    } else {
      const rows = await ctx.db
        .query("parallelRunDifferences")
        .withIndex("by_tenantId", (q) =>
          q.eq("tenantId", tenantId).gte("_creationTime", since),
        )
        .take(want * 5);
      const { fresh, next } = pastCursor(rows, after);
      progress.openCount += fresh.filter(
        (row) => row.deletedAt == null && row.status === "open",
      ).length;
      room -= Math.ceil(fresh.length / 5);
      progress.after = next;
      if (rows.length < want * 5) {
        progress.stage = "done";
        progress.after = null;
      }
    }
  }
  return progress;
}

function isPeriodCheck(row: Doc<"parallelRunComparisons">): boolean {
  try {
    return (
      (JSON.parse(row.summary ?? "{}") as ComparisonSummary).period != null
    );
  } catch {
    return false;
  }
}

/** The newest daily comparison (a period check is not one). */
async function newestComparison(ctx: QueryCtx, tenantId: string) {
  const rows = await ctx.db
    .query("parallelRunComparisons")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .order("desc")
    .take(50);
  return rows.find((row) => !isPeriodCheck(row)) ?? null;
}

/**
 * One comparison. With `book`, the next one is booked a day later, unless the
 * company already switched from TPP (go): then the daily run stops.
 */
type ComparisonResult = Omit<ComparisonProgress, "stage" | "after">;

function resultOf(progress: ComparisonProgress): ComparisonResult {
  const { stage: _stage, after: _after, ...result } = progress;
  return result;
}

/**
 * Work as far as this run may. When the work is not done, the next part is
 * booked at once with the state so far.
 */
async function workOrBook(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  mode: ComparisonMode,
  start: ComparisonProgress,
): Promise<ComparisonProgress> {
  const progress = await workComparison(
    ctx,
    tenantId,
    now,
    windowOf(mode, now),
    start,
  );
  if (progress.stage !== "done") {
    await ctx.scheduler.runAfter(0, internal.parallelRun.continueComparison, {
      tenantId,
      now,
      mode,
      progress: JSON.stringify(progress),
    });
  }
  return progress;
}

/** Keep a finished daily comparison and book the next day's run. */
async function finishDaily(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  book: boolean,
  progress: ComparisonProgress,
) {
  const result = resultOf(progress);
  const decision = await cutoverDecisionOf(ctx.db, tenantId);
  const switched = decision?.status === "go";
  let nextRunAt: number | null = null;
  if (book && !switched) {
    nextRunAt = now + DAY_MS;
    await ctx.scheduler.runAt(nextRunAt, internal.parallelRun.compareTenant, {
      tenantId,
      book: true,
    });
  } else if (!book) {
    // A "Compare now" keeps the booked daily run's time.
    nextRunAt = (await newestComparison(ctx, tenantId))?.nextRunAt ?? null;
  }
  const id = await ctx.db.insert("parallelRunComparisons", {
    tenantId,
    comparedAt: now,
    comparedCount: result.comparedCount,
    openCount: result.openCount,
    newCount: result.newCount,
    clearedCount: result.clearedCount,
    summary: JSON.stringify(result.summary),
    nextRunAt,
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
  await insertStepEvent(ctx, {
    type: "parallel_run.compared",
    entity: "ParallelRunComparison",
    entityId: String(id),
    payload: {
      parallelRunComparisonId: String(id),
      tenantId,
      newCount: result.newCount,
      clearedCount: result.clearedCount,
    },
    createdAt: now,
  });
  return { comparisonId: id, continuing: false as const, ...result, nextRunAt };
}

/** Keep a finished period check with its verdict. */
async function finishPeriod(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  period: { from: number; to: number },
  progress: ComparisonProgress,
) {
  const result = resultOf(progress);
  const verdict = reconcileVerdict(result.summary, result.openInWindow);
  const summary: ComparisonSummary = {
    ...result.summary,
    period: { from: period.from, to: period.to, verdict },
  };
  const id = await ctx.db.insert("parallelRunComparisons", {
    tenantId,
    comparedAt: now,
    comparedCount: result.comparedCount,
    openCount: result.openCount,
    newCount: result.newCount,
    clearedCount: result.clearedCount,
    summary: JSON.stringify(summary),
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
  await insertStepEvent(ctx, {
    type: "parallel_run.period_checked",
    entity: "ParallelRunComparison",
    entityId: String(id),
    payload: {
      parallelRunComparisonId: String(id),
      tenantId,
      from: period.from,
      to: period.to,
      passed: verdict.passed,
    },
    createdAt: now,
  });
  return { comparisonId: id, continuing: false as const, verdict, summary };
}

/**
 * One comparison. With `book`, the next one is booked a day later, unless the
 * company already switched from TPP (go): then the daily run stops. A big
 * company's comparison goes on in booked parts; the comparison row is kept
 * when the last part is done.
 */
export const compareTenant = internalMutation({
  args: { tenantId: v.string(), book: v.boolean() },
  handler: async (ctx, { tenantId, book }) => {
    const now = Date.now();
    const mode: ComparisonMode = { kind: "daily", book };
    const progress = await workOrBook(
      ctx,
      tenantId,
      now,
      mode,
      startProgress(windowOf(mode, now)),
    );
    if (progress.stage === "done")
      return await finishDaily(ctx, tenantId, now, book, progress);
    return {
      comparisonId: null,
      continuing: true as const,
      ...resultOf(progress),
      nextRunAt: null,
    };
  },
});

/** The next part of a comparison a run could not finish. */
export const continueComparison = internalMutation({
  args: {
    tenantId: v.string(),
    now: v.number(),
    mode: modeValidator,
    progress: v.string(),
  },
  handler: async (ctx, { tenantId, now, mode, progress }) => {
    const next = await workOrBook(
      ctx,
      tenantId,
      now,
      mode,
      JSON.parse(progress) as ComparisonProgress,
    );
    if (next.stage !== "done") return null;
    if (mode.kind === "daily")
      await finishDaily(ctx, tenantId, now, mode.book, next);
    else await finishPeriod(ctx, tenantId, now, mode, next);
    return null;
  },
});

function requireImportAccess(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!canRead(auth, ["importAccess"])) {
    throw new ConvexError(
      "Only staff who run imports can work the TPP comparison.",
    );
  }
}

/**
 * "Compare now": runs one comparison at once. When no daily run is booked
 * (the first time, or after a stop) this run books the daily ones.
 */
export const compareNow = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth);
    const newest = await newestComparison(ctx, tenantId);
    const booked = newest?.nextRunAt != null && newest.nextRunAt > Date.now();
    await ctx.scheduler.runAfter(0, internal.parallelRun.compareTenant, {
      tenantId,
      book: !booked,
    });
    return { dailyAlreadyBooked: booked };
  },
});

/**
 * "The difference is fine" for every open difference of one kind (for
 * example every stage difference while TPP keeps its own stages).
 */
export const acceptAllOfField = mutation({
  args: { field: v.string(), note: v.string() },
  handler: async (ctx, { field, note }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth);
    if (note.trim().length === 0) {
      throw new ConvexError("Say why these differences are fine.");
    }
    const rows = (
      await ctx.db
        .query("parallelRunDifferences")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter(
      (row) =>
        row.deletedAt == null && row.status === "open" && row.field === field,
    );
    const now = Date.now();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "accepted",
        resolvedByUserId: auth.id,
        resolvedAt: now,
        resolutionNote: note.trim(),
        updatedAt: now,
        version: row.version + 1,
      });
      await insertStepEvent(ctx, {
        type: "parallel_run_difference.settled",
        entity: "ParallelRunDifference",
        entityId: String(row._id),
        payload: {
          parallelRunDifferenceId: String(row._id),
          tenantId,
          field,
        },
        createdAt: now,
      });
    }
    return { accepted: rows.length };
  },
});

export interface ParallelRunDifferenceRow {
  id: Id<"parallelRunDifferences">;
  version: number;
  field: string;
  status: Doc<"parallelRunDifferences">["status"];
  sourceValue: string | null;
  capsuleValue: string | null;
  externalId: string;
  tppTitle: string | null;
  /** The import that last read this TPP event (its source rows). */
  importRunId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  assignedToPersonId: string | null;
  assignedToName: string | null;
  resolutionNote: string | null;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
}

function readSummary(
  row: Doc<"parallelRunComparisons"> | null,
): ComparisonSummary | null {
  if (!row?.summary) return null;
  try {
    return JSON.parse(row.summary) as ComparisonSummary;
  } catch {
    return null;
  }
}

/**
 * Check one period (the test year, then the whole history) against the
 * documented tolerances. Its differences join the same list, so people
 * settle them the same way; the result is kept as a comparison row.
 */
export const reconcilePeriod = mutation({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    requireImportAccess(auth);
    if (!(to > from)) {
      throw new ConvexError("The last day must come after the first day.");
    }
    const now = Date.now();
    const mode: ComparisonMode = { kind: "period", from, to };
    const progress = await workOrBook(
      ctx,
      tenantId,
      now,
      mode,
      startProgress(windowOf(mode, now)),
    );
    if (progress.stage === "done")
      return await finishPeriod(ctx, tenantId, now, { from, to }, progress);
    // A long history goes on in booked parts; the result shows on the page
    // when the last part is done.
    return {
      comparisonId: null,
      continuing: true as const,
      verdict: {
        passed: false,
        reasons: [
          "The check is still running. The result shows here when it is done.",
        ],
      },
      summary: progress.summary,
    };
  },
});

/** The newest comparison and every difference not cleared yet. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canRead(auth, ["importAccess"])) return null;
    const newest = await newestComparison(ctx, tenantId);
    const lastPeriod = (
      await ctx.db
        .query("parallelRunComparisons")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(50)
    ).find(isPeriodCheck);
    const rows = (
      await ctx.db
        .query("parallelRunDifferences")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter((row) => row.deletedAt == null && row.status !== "cleared");
    rows.sort((a, b) =>
      a.status === b.status
        ? (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)
        : a.status === "open"
          ? -1
          : b.status === "open"
            ? 1
            : 0,
    );
    const differences: ParallelRunDifferenceRow[] = [];
    for (const row of rows.slice(0, LIST_LIMIT)) {
      const link = await ctx.db.get(row.externalRecordLinkId);
      const tpp =
        link && link.tenantId === tenantId
          ? tppEventFromRaw(link.rawSourceData)
          : null;
      const eventId = ctx.db.normalizeId("events", row.capsuleId);
      const event = eventId ? await ctx.db.get(eventId) : null;
      const ownEvent = event && event.tenantId === tenantId ? event : null;
      const person = row.assignedToPersonId
        ? await ctx.db.get(row.assignedToPersonId)
        : null;
      differences.push({
        id: row._id,
        version: row.version,
        field: row.field,
        status: row.status,
        sourceValue: row.sourceValue ?? null,
        capsuleValue: row.capsuleValue ?? null,
        externalId: row.externalId,
        tppTitle: tpp?.title ?? null,
        importRunId:
          link && link.tenantId === tenantId
            ? (link.lastSeenImportRunId ?? link.sourceImportRunId ?? null)
            : null,
        eventId: ownEvent ? String(ownEvent._id) : null,
        eventTitle: ownEvent?.title ?? null,
        assignedToPersonId: row.assignedToPersonId
          ? String(row.assignedToPersonId)
          : null,
        assignedToName:
          person && person.tenantId === tenantId
            ? (personName(person) ?? null)
            : null,
        resolutionNote: row.resolutionNote ?? null,
        firstSeenAt: row.firstSeenAt ?? null,
        lastSeenAt: row.lastSeenAt ?? null,
      });
    }
    const summary = readSummary(newest);
    const periodSummary = readSummary(lastPeriod ?? null);
    return {
      periodCheck:
        lastPeriod && periodSummary?.period
          ? {
              comparedAt: lastPeriod.comparedAt,
              from: periodSummary.period.from,
              to: periodSummary.period.to,
              verdict: periodSummary.period.verdict,
              summary: periodSummary,
            }
          : null,
      comparison: newest
        ? {
            comparedAt: newest.comparedAt,
            comparedCount: newest.comparedCount,
            openCount: newest.openCount,
            newCount: newest.newCount,
            clearedCount: newest.clearedCount,
            nextRunAt: newest.nextRunAt ?? null,
            summary,
          }
        : null,
      differences,
      totalDifferences: rows.length,
    };
  },
});
