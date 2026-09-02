/**
 * AUTHOR SEAM — team chat reads (direct messages + event channels).
 *
 * StaffMessage rows are generated (src/workforce/staff-message.manifest);
 * this seam only READS them, shaped for the chat UI:
 *   - listChannel: one thread (a DM pair or an event channel), decrypted,
 *     with its Attachment rows hydrated to download URLs.
 *   - listConversations: the rail — DM partners with unread counts and
 *     event channels with unread counts against the caller's read cursor.
 *   - channelSummary: one channel's facts for the tab header / phone card.
 *   - searchLinkTargets: bounded record search for the `#` picker.
 *
 * Access: the generated read policy already hides other people's DMs; this
 * seam re-applies the same rule (a DM is visible only to its two parties)
 * and tenant-checks every FK it hydrates, so a guessed id from another
 * tenant yields nothing. No auth subject ids or HR fields leave the server.
 *
 * Reads are index-bounded and time-bounded (`since` = now − retention):
 * never a tenant-wide scan of staffMessages (the Aug 2026 read storm).
 * Wall-clock comes in as `since` / `now`. Helpers live in lib/teamChatRead.ts.
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  chatAuth,
  live,
  MAX_THREAD_MESSAGES,
  previewOf,
  readCursorsForChannels,
  receivedBy,
  sentAt,
  sentBy,
  tenantEvent,
  tenantPerson,
  toView,
  type ChatMessageView,
} from "./lib/teamChatRead";
import { channelRows, scanChannel } from "./lib/teamChatScan";
import { TEXT_TARGETS } from "./search";

/** Channels stay in the rail from one day before the event starts. */
const DAY_MS = 86_400_000;
/** Newest events (by creation) considered for the rail. */
const EVENT_SCAN = 400;
/** Event channels the rail reads unread counts for per run. */
const EVENT_CANDIDATES = 80;
/** Messages hydrated concurrently (each up to 20 attachment URL lookups). */
const HYDRATE_BATCH = 16;
/** LIVE rows one rail channel examines (own rows past this read as "50+"). */
const RAIL_LIVE_CAP = 150;
/**
 * Rows the whole rail may walk across its channels; with the DM walks (2 ×
 * 4000), the events page and the cursor reads it stays well under Convex's
 * 32,000-document transaction limit. Channels past the budget are listed
 * without a badge.
 */
const RAIL_WALK_BUDGET = 8000;

/**
 * One thread. Pass exactly one of `eventId` (event channel) or
 * `otherPersonId` (direct messages with that teammate). Returns null when
 * the caller may not read it (no staff profile for a DM, foreign event).
 */
export const listChannel = query({
  args: {
    eventId: v.optional(v.string()),
    otherPersonId: v.optional(v.string()),
    /** Oldest send time to include (client passes now − retention). */
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) return null;
    const tenantId = auth.tenantId;
    let rows: Doc<"staffMessages">[];

    if (args.eventId) {
      const event = await tenantEvent(ctx, tenantId, args.eventId);
      if (!event) return null;
      rows = await channelRows(
        ctx,
        tenantId,
        event._id,
        args.since,
        MAX_THREAD_MESSAGES,
      );
    } else if (args.otherPersonId) {
      if (!auth.personId) return null;
      const other = await tenantPerson(ctx, tenantId, args.otherPersonId);
      if (!other) return null;
      const me = auth.personId as Doc<"people">["_id"];
      // Both halves come from the caller's own DM ranges — the same rows the
      // rail counts — never from the partner's whole sent history.
      const [sent, received] = await Promise.all([
        sentBy(ctx, me, args.since),
        receivedBy(ctx, me, args.since),
      ]);
      rows = [
        ...sent.filter((row) => row.recipientPersonId === other._id),
        ...received.filter((row) => row.senderPersonId === other._id),
      ];
    } else {
      return { messages: [] as ChatMessageView[] };
    }

    const kept = rows
      .filter(
        (row) =>
          row.tenantId === tenantId && live(row) && sentAt(row) >= args.since,
      )
      .sort((a, b) => sentAt(b) - sentAt(a))
      .slice(0, MAX_THREAD_MESSAGES)
      .reverse();
    // Hydrate in small batches: each view decrypts its body and resolves a
    // signed URL per attachment (up to 20), so a full 400-row thread fanned
    // out at once would exceed Convex's concurrent I/O limit.
    const messages: ChatMessageView[] = [];
    for (let i = 0; i < kept.length; i += HYDRATE_BATCH) {
      messages.push(
        ...(await Promise.all(
          kept
            .slice(i, i + HYDRATE_BATCH)
            .map((row) => toView(ctx, tenantId, row)),
        )),
      );
    }
    return { messages };
  },
});

type DirectConversation = {
  personId: string;
  lastAt: number;
  unread: number;
  preview: string;
};

type EventConversation = {
  eventId: string;
  title: string;
  startsAt: number | null;
  stage: string;
  lastAt: number | null;
  unread: number;
  unreadCapped: boolean;
  preview: string;
  /** The caller's read-cursor row for this channel, if one exists. */
  myCursorId: string | null;
  lastReadAt: number | null;
};

/**
 * The conversation rail: direct-message partners (recency order) and event
 * channels (event date order) with unread counts. Channels appear for live,
 * non-cancelled events whose start lies inside the retention window (the
 * last 90 days and everything ahead), bounded to EVENT_CANDIDATES per run.
 */
export const listConversations = query({
  args: { since: v.number(), now: v.number() },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) return null;
    const tenantId = auth.tenantId;
    const me = auth.personId ? (auth.personId as Doc<"people">["_id"]) : null;

    // --- direct messages -------------------------------------------------
    const direct: DirectConversation[] = [];
    if (me) {
      const [sent, received] = await Promise.all([
        sentBy(ctx, me, args.since),
        receivedBy(ctx, me, args.since),
      ]);
      // Group by partner, then count unread only inside the newest
      // MAX_THREAD_MESSAGES of that pair — exactly the rows the thread shows
      // and marks read — so a badge can never point at unreachable rows.
      const byOther = new Map<string, Doc<"staffMessages">[]>();
      const consider = (row: Doc<"staffMessages">, other: string) => {
        if (row.tenantId !== tenantId || !live(row)) return;
        if (sentAt(row) < args.since) return;
        const rows = byOther.get(other);
        if (rows) rows.push(row);
        else byOther.set(other, [row]);
      };
      for (const row of sent) {
        if (row.recipientPersonId) consider(row, String(row.recipientPersonId));
      }
      for (const row of received) consider(row, String(row.senderPersonId));
      for (const [personId, rows] of byOther) {
        const shown = rows
          .sort((a, b) => sentAt(b) - sentAt(a))
          .slice(0, MAX_THREAD_MESSAGES);
        const newest = shown[0];
        if (!newest) continue;
        direct.push({
          personId,
          lastAt: sentAt(newest),
          unread: shown.filter(
            (row) => row.recipientPersonId === me && row.readAt == null,
          ).length,
          preview: await previewOf(ctx, newest),
        });
      }
      direct.sort((a, b) => b.lastAt - a.lastAt);
    }

    // --- event channels --------------------------------------------------

    // Bounded: the newest EVENT_SCAN events by creation (there is no startsAt
    // index), then only those inside the retention window, then at most
    // EVENT_CANDIDATES channels — upcoming first, then the most recent past.
    // Each candidate costs one small index read, never a tenant-wide message
    // scan; an event booked before 400 newer ones is reachable from its tab.
    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(EVENT_SCAN);
    const inWindow = recentEvents.filter(
      (event) =>
        live(event) &&
        event.stage !== "cancelled" &&
        event.startsAt != null &&
        event.startsAt >= args.since,
    );
    const upcoming = inWindow
      .filter((event) => (event.startsAt ?? 0) >= args.now - DAY_MS)
      .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
    const past = inWindow
      .filter((event) => (event.startsAt ?? 0) < args.now - DAY_MS)
      .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
    // Half the budget is reserved for the most recent past events, so last
    // night's channel stays in the rail for a tenant with a long forward
    // calendar; upcoming fills the rest. (`events` is re-sorted below.)
    const half = EVENT_CANDIDATES / 2;
    const candidates = [
      ...past.slice(0, Math.max(half, EVENT_CANDIDATES - upcoming.length)),
      ...upcoming,
    ].slice(0, EVENT_CANDIDATES);
    // Only the cursors of the channels in view — never the account's history.
    const cursors = await readCursorsForChannels(
      ctx,
      tenantId,
      auth.id,
      candidates.map((event) => `event:${String(event._id)}`),
    );

    const events: EventConversation[] = [];
    let budget = RAIL_WALK_BUDGET;
    for (const event of candidates) {
      const cursor = cursors.get(`event:${String(event._id)}`) ?? null;
      const readUpTo = cursor?.lastReadAt ?? 0;
      const upcomingEvent =
        event.startsAt != null && event.startsAt >= args.now - DAY_MS;
      if (budget <= 0) {
        // Budget spent: still list what is upcoming, without a badge.
        if (upcomingEvent) {
          events.push({
            eventId: String(event._id),
            title: String(event.title ?? "Untitled event"),
            startsAt: event.startsAt ?? null,
            stage: String(event.stage ?? ""),
            lastAt: null,
            unread: 0,
            unreadCapped: false,
            preview: "",
            myCursorId: cursor?.id ?? null,
            lastReadAt: cursor?.lastReadAt ?? null,
          });
        }
        continue;
      }
      // Newest first, live rows only, stopping at the cursor. Removed rows
      // spend only the shared physical budget, never the live cap, so a
      // removed burst cannot hide a live channel or its unread rows.
      const scan = await scanChannel(ctx, tenantId, event._id, {
        since: args.since,
        readUpTo,
        me,
        stopAtCursor: true,
        countLimit: RAIL_LIVE_CAP,
        walkCap: budget,
      });
      budget -= scan.walked;
      const newest = scan.newest;
      const lastAt = newest ? sentAt(newest) : null;
      if (!upcomingEvent && lastAt == null) continue;
      events.push({
        eventId: String(event._id),
        title: String(event.title ?? "Untitled event"),
        startsAt: event.startsAt ?? null,
        stage: String(event.stage ?? ""),
        lastAt,
        unread: scan.unread,
        unreadCapped: scan.unreadCapped,
        preview: await previewOf(ctx, newest),
        myCursorId: cursor?.id ?? null,
        lastReadAt: cursor?.lastReadAt ?? null,
      });
    }
    events.sort(
      (a, b) =>
        (a.startsAt ?? Number.MAX_SAFE_INTEGER) -
          (b.startsAt ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title),
    );

    return { direct, events };
  },
});

/**
 * Compact facts about one event channel for the tab header and the phone
 * overview card: bounded count, newest preview, unread against the caller's
 * cursor, and the caller's cursor row so the client can touch it. Bounded
 * to the same retention window the thread shows.
 */
export const channelSummary = query({
  args: { eventId: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) return null;
    const tenantId = auth.tenantId;
    const event = await tenantEvent(ctx, tenantId, args.eventId);
    if (!event) return null;
    const me = auth.personId ? (auth.personId as Doc<"people">["_id"]) : null;
    const channelKey = `event:${String(event._id)}`;
    const cursor =
      (await readCursorsForChannels(ctx, tenantId, auth.id, [channelKey])).get(
        channelKey,
      ) ?? null;
    const readUpTo = cursor?.lastReadAt ?? 0;
    const scan = await scanChannel(ctx, tenantId, event._id, {
      since: args.since,
      readUpTo,
      me,
      stopAtCursor: false,
      countLimit: MAX_THREAD_MESSAGES,
    });
    const newest = scan.newest;
    return {
      count: scan.count,
      countCapped: scan.countCapped,
      lastAt: newest ? sentAt(newest) : null,
      preview: await previewOf(ctx, newest),
      unread: scan.unread,
      unreadCapped: scan.unreadCapped,
      myCursorId: cursor?.id ?? null,
      lastReadAt: cursor?.lastReadAt ?? null,
    };
  },
});

/** Kinds the `#` picker offers — records a crew member links in conversation. */
const LINKABLE_KINDS = new Set([
  "event",
  "dish",
  "menu",
  "client",
  "component",
  "ingredient",
]);

/** Bounded full-text search over linkable records for the composer. */
export const searchLinkTargets = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) return [];
    const term = args.term.trim();
    if (term.length < 2) return [];
    const tenantId = auth.tenantId;
    const hits = new Map<
      string,
      { kind: string; id: string; label: string; hint: string; score: number }
    >();
    await Promise.all(
      TEXT_TARGETS.filter((target) => LINKABLE_KINDS.has(target.kind)).map(
        async (target) => {
          // Table/index/field are data-driven, so go through an untyped builder.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows: any[] = await (ctx.db as any)
            .query(target.table)
            .withSearchIndex(target.index, (q: any) =>
              q.search(target.field, term).eq("tenantId", tenantId),
            )
            .take(5);
          for (const row of rows) {
            if (row.deletedAt != null) continue;
            const key = `${target.kind}:${String(row._id)}`;
            const score = Number(row._score ?? 0);
            const existing = hits.get(key);
            if (existing && existing.score >= score) continue;
            hits.set(key, {
              kind: target.kind,
              id: String(row._id),
              label: target.label(row),
              hint: target.hint,
              score,
            });
          }
        },
      ),
    );
    return [...hits.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ kind, id, label, hint }) => ({ kind, id, label, hint }));
  },
});
