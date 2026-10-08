// Staff and admin screens that keep a history (candidates, one-on-ones,
// reviews, training, announcements, import conflicts) read only what they
// show: the newest page with more on request, the rows of the records on
// screen, and counts made here. The generated lists (listCandidate,
// listOneOnOne, ...) load the company's whole table, and on the live server
// those loads ran out of time.
//
// Each query keeps the read rule of its generated list and opens the same
// encrypted fields; a caller who may not read gets nothing, as there.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { canRead } from "./search";

const IDS_CAP = 1000;
/**
 * Announcements and import conflicts have no index on expiry or state yet,
 * so the newest rows are read and the live ones kept.
 */
const NEWEST_CAP = 500;

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

/** Same as the generated lists' field decryption. */
async function opened<T extends Record<string, unknown>>(
  ctx: QueryCtx,
  entity: string,
  fields: readonly string[],
  doc: T,
): Promise<T> {
  const out: Record<string, unknown> = { ...doc };
  for (const property of fields) {
    const raw = out[property];
    if (typeof raw !== "string") continue;
    let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null;
    try {
      envelope = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("v" in envelope && "kid" in envelope && "ct" in envelope)
    )
      continue;
    if (envelope.v !== 1)
      throw new Error(
        `Unsupported Manifest encryption envelope version: ${String(envelope.v)}`,
      );
    out[property] = await decrypt(String(envelope.ct), String(envelope.kid), {
      ctx,
      entity,
      property,
    });
  }
  return out as T;
}

/** workforceManageAccess: admin, owner, system, workforce_manager. */
const managesWorkforce = (auth: AppAuthContext) =>
  ["admin", "owner", "system", "workforce_manager"].includes(auth.role) &&
  !orgCapabilityDeniesAction(
    "workforceManageAccess",
    auth.disabledCapabilities,
  );
const workforce = (auth: AppAuthContext) => canRead(auth, ["workforceAccess"]);

const live = <T extends { deletedAt?: number | null; tenantId: string }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);

/** Candidates, newest first, a page at a time. */
export const candidatePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !managesWorkforce(auth)) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("candidates")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: live(result.page, tenantId) };
  },
});

/** The interviews of these candidates (at most 1000). */
export const interviewsFor = query({
  args: { candidateIds: v.array(v.string()) },
  handler: async (ctx, { candidateIds }): Promise<Doc<"interviews">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !managesWorkforce(auth)) return [];
    const tenantId = auth.tenantId;
    const out: Doc<"interviews">[] = [];
    for (const raw of [...new Set(candidateIds)].slice(0, IDS_CAP)) {
      const candidateId = ctx.db.normalizeId("candidates", raw);
      if (!candidateId) continue;
      out.push(
        ...live(
          await ctx.db
            .query("interviews")
            .withIndex("by_candidateId", (q) =>
              q.eq("candidateId", candidateId),
            )
            .collect(),
          tenantId,
        ),
      );
    }
    return out;
  },
});

/** One-on-ones, newest first, a page at a time. */
export const oneOnOnePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !managesWorkforce(auth)) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("oneOnOnes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: live(result.page, tenantId) };
  },
});

/**
 * The actions of these meetings (at most 1000), and, for the staff member a
 * new meeting is being held with, that person's held meetings and their
 * actions (what carries into the next meeting).
 */
export const oneOnOneActionsFor = query({
  args: { oneOnOneIds: v.array(v.string()), staffMemberId: v.string() },
  handler: async (ctx, { oneOnOneIds, staffMemberId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      actions: [] as Doc<"oneOnOneActions">[],
      staffMeetings: [] as Doc<"oneOnOnes">[],
      staffActions: [] as Doc<"oneOnOneActions">[],
    };
    if (!auth.tenantId || !managesWorkforce(auth)) return out;
    const tenantId = auth.tenantId;
    const actionsOf = async (meetingId: Id<"oneOnOnes">) =>
      live(
        await ctx.db
          .query("oneOnOneActions")
          .withIndex("by_oneOnOneId", (q) => q.eq("oneOnOneId", meetingId))
          .collect(),
        tenantId,
      );
    for (const raw of [...new Set(oneOnOneIds)].slice(0, IDS_CAP)) {
      const id = ctx.db.normalizeId("oneOnOnes", raw);
      if (id) out.actions.push(...(await actionsOf(id)));
    }
    const personId = staffMemberId
      ? ctx.db.normalizeId("people", staffMemberId)
      : null;
    if (personId) {
      out.staffMeetings = live(
        await ctx.db
          .query("oneOnOnes")
          .withIndex("by_staffMemberId", (q) => q.eq("staffMemberId", personId))
          .collect(),
        tenantId,
      ).filter((row) => row.heldAt != null);
      for (const meeting of out.staffMeetings)
        out.staffActions.push(...(await actionsOf(meeting._id)));
    }
    return out;
  },
});

/** Performance reviews, newest first, a page at a time. */
export const performanceReviewPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !managesWorkforce(auth)) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("performanceReviews")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        live(result.page, tenantId).map((row) =>
          opened(ctx, "PerformanceReview", ["notes"], row),
        ),
      ),
    };
  },
});

/** Training completions, newest first, a page at a time. */
export const trainingCompletionPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !workforce(auth)) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("trainingCompletions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        live(result.page, tenantId).map((row) =>
          opened(ctx, "TrainingCompletion", ["notes"], row),
        ),
      ),
    };
  },
});

/**
 * How many recorded completions each training module has, and in all, read
 * module by module. Only the counts are sent.
 */
export const trainingCompletionCounts = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const out = { total: 0, byModule: {} as Record<string, number> };
    if (!auth.tenantId || !workforce(auth)) return out;
    const tenantId = auth.tenantId;
    const modules = await ctx.db
      .query("trainingModules")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    for (const module of modules) {
      const count = live(
        await ctx.db
          .query("trainingCompletions")
          .withIndex("by_trainingModuleId", (q) =>
            q.eq("trainingModuleId", module._id),
          )
          .collect(),
        tenantId,
      ).filter((row) => row.recordedAt != null).length;
      out.byModule[module._id] = count;
      out.total += count;
    }
    return out;
  },
});

/** Training sign-offs, newest first, a page at a time. */
export const trainingSignOffPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !workforce(auth)) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("trainingSignOffs")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: live(result.page, tenantId) };
  },
});

/** Announcements, newest first, a page at a time. */
export const announcementPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return EMPTY_PAGE;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("announcements")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: live(result.page, tenantId) };
  },
});

/** Announcements not yet expired at `now`, among the newest 500. */
export const activeAnnouncements = query({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<Doc<"announcements">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return [];
    const tenantId = auth.tenantId;
    return live(
      await ctx.db
        .query("announcements")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(NEWEST_CAP),
      tenantId,
    ).filter((row) => row.expiresAt > now);
  },
});

/** Import conflicts still waiting for a person, among the newest 500. */
export const pendingImportConflicts = query({
  args: {},
  handler: async (ctx): Promise<Doc<"importConflicts">[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["importAccess"])) return [];
    const tenantId = auth.tenantId;
    return live(
      await ctx.db
        .query("importConflicts")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(NEWEST_CAP),
      tenantId,
    ).filter((row) => row.status === "pending");
  },
});
