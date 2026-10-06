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

async function runComparison(
  ctx: MutationCtx,
  tenantId: string,
  now: number,
  window: { from: number; to: number | null },
): Promise<{
  summary: ComparisonSummary;
  comparedCount: number;
  openCount: number;
  newCount: number;
  clearedCount: number;
  /** Differences still open for events inside the window. */
  openInWindow: number;
}> {
  // Only venue, event and person links take part; reading every link of
  // the company is too much once the archive imports land.
  const read = await Promise.all([
    ...["venue", "event"].map((recordType) =>
      ctx.db
        .query("externalRecordLinks")
        .withIndex("by_tenantId_and_recordType", (q) =>
          q.eq("tenantId", tenantId).eq("recordType", recordType),
        )
        .collect(),
    ),
    ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_capsuleEntity", (q) =>
        q.eq("tenantId", tenantId).eq("capsuleEntity", "person"),
      )
      .collect(),
  ]);
  const links = [
    ...new Map(read.flat().map((link) => [String(link._id), link])).values(),
  ].filter(
    (link) =>
      link.sourceSystem === "tpp_legacy" &&
      link.deletedAt == null &&
      link.conflictStatus !== "superseded",
  );

  // TPP ids an earlier import matched to Capsule records.
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
  const lookups: IdentityLookups = {
    salesperson: (tppId) => personByTpp.get(tppId),
    venue: (tppId) => venueByTpp.get(tppId),
  };

  const inWindow = (at: number) =>
    at >= window.from && (window.to == null || at <= window.to);
  const summary = newSummary(window.from, window.to);
  const found = new Map<
    string,
    {
      link: Doc<"externalRecordLinks">;
      field: string;
      source: string;
      mine: string;
    }
  >();
  const comparedLinks = new Set<string>();
  const linkedEventIds = new Set<string>();
  for (const link of links) {
    if (link.recordType !== "event") continue;
    if (link.capsuleId) linkedEventIds.add(link.capsuleId);
    const tpp = tppEventFromRaw(link.rawSourceData);
    if (!tpp || tpp.startsAt == null || !inWindow(tpp.startsAt)) continue;
    addTppEvent(summary.tpp, tpp, lookups);
    if (!link.capsuleId) {
      // Still on the match-up page; nothing to compare yet.
      summary.onlyInTpp += 1;
      continue;
    }
    const eventId = ctx.db.normalizeId("events", link.capsuleId);
    const event = eventId ? await ctx.db.get(eventId) : null;
    const capsule = event ? await capsuleSide(ctx, tenantId, event) : null;
    comparedLinks.add(String(link._id));
    for (const difference of compareEventPair(tpp, capsule, lookups)) {
      found.set(`${link._id}|${difference.field}`, {
        link,
        field: difference.field,
        source: difference.sourceValue,
        mine: difference.capsuleValue,
      });
    }
  }

  const events = await ctx.db
    .query("events")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  for (const event of events) {
    if (event.deletedAt != null) continue;
    if (event.startsAt == null || !inWindow(event.startsAt)) continue;
    addCapsuleEvent(summary.capsule, await capsuleSide(ctx, tenantId, event));
    if (!linkedEventIds.has(String(event._id))) summary.onlyInCapsule += 1;
  }

  const saved = (
    await ctx.db
      .query("parallelRunDifferences")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null);
  let newCount = 0;
  let clearedCount = 0;
  let openInWindow = 0;
  const seen = new Set<string>();
  for (const row of saved) {
    const key = `${row.externalRecordLinkId}|${row.field}`;
    seen.add(key);
    const today = found.get(key);
    // A link not compared today (its event left the window) keeps its row.
    if (!today && !comparedLinks.has(String(row.externalRecordLinkId)))
      continue;
    const status = nextDifferenceStatus(
      row.status,
      today != null &&
        today.source === row.sourceValue &&
        today.mine === row.capsuleValue,
      today != null,
    );
    if (today && status === "open") openInWindow += 1;
    if (status === "cleared" && row.status === "cleared") continue;
    if (status === "cleared") clearedCount += 1;
    const reopened = status === "open" && row.status !== "open";
    await ctx.db.patch(row._id, {
      status,
      ...(today
        ? {
            sourceValue: today.source,
            capsuleValue: today.mine,
            capsuleId: today.link.capsuleId,
            lastSeenAt: now,
          }
        : {}),
      ...(reopened ? { resolvedByUserId: null, resolvedAt: null } : {}),
      updatedAt: now,
      version: row.version + 1,
    });
  }
  for (const [key, today] of found) {
    if (seen.has(key)) continue;
    await ctx.db.insert("parallelRunDifferences", {
      tenantId,
      deletedAt: null,
      externalRecordLinkId: today.link._id,
      externalId: today.link.externalId,
      capsuleEntity: today.link.capsuleEntity,
      capsuleId: today.link.capsuleId,
      field: today.field,
      sourceValue: today.source,
      capsuleValue: today.mine,
      status: "open",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
    newCount += 1;
    openInWindow += 1;
  }
  const openCount = (
    await ctx.db
      .query("parallelRunDifferences")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((row) => row.deletedAt == null && row.status === "open").length;
  return {
    summary,
    comparedCount: comparedLinks.size,
    openCount,
    newCount,
    clearedCount,
    openInWindow,
  };
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
export const compareTenant = internalMutation({
  args: { tenantId: v.string(), book: v.boolean() },
  handler: async (ctx, { tenantId, book }) => {
    const now = Date.now();
    const decision = await cutoverDecisionOf(ctx.db, tenantId);
    const switched = decision?.status === "go";
    const result = await runComparison(ctx, tenantId, now, {
      from: now - WINDOW_MS,
      to: null,
    });
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
    return { comparisonId: id, ...result, nextRunAt };
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
    const result = await runComparison(ctx, tenantId, now, { from, to });
    const verdict = reconcileVerdict(result.summary, result.openInWindow);
    const summary: ComparisonSummary = {
      ...result.summary,
      period: { from, to, verdict },
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
        from,
        to,
        passed: verdict.passed,
      },
      createdAt: now,
    });
    return { comparisonId: id, verdict, summary };
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
