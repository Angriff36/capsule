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
  inChannel,
  live,
  MAX_THREAD_MESSAGES,
  previewOf,
  RANGE_TAKE,
  readCursorsFor,
  receivedBy,
  sentAt,
  sentBy,
  tenantEvent,
  tenantPerson,
  toView,
  UNREAD_SCAN,
  type ChatMessageView,
} from "./lib/teamChatRead";
import { TEXT_TARGETS } from "./search";

/** Channels stay in the rail from one day before the event starts. */
const DAY_MS = 86_400_000;
/** Newest events (by creation) considered for the rail. */
const EVENT_SCAN = 400;
/** Event channels the rail reads unread counts for per run. */
const EVENT_CANDIDATES = 80;

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
      rows = await inChannel(ctx, event._id, RANGE_TAKE);
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
    return {
      messages: await Promise.all(
        kept.map((row) => toView(ctx, tenantId, row)),
      ),
    };
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
 * non-cancelled events that start from yesterday onward, plus any event
 * whose channel has messages inside the retention window.
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
    const cursors = await readCursorsFor(ctx, tenantId, auth.id);

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
    const candidates = [...upcoming, ...past].slice(0, EVENT_CANDIDATES);

    const events: EventConversation[] = [];
    await Promise.all(
      candidates.map(async (event) => {
        // Same window the thread shows, so a badge never counts hidden rows.
        const scanned = (await inChannel(ctx, event._id, UNREAD_SCAN)).filter(
          (row) =>
            row.tenantId === tenantId && live(row) && sentAt(row) >= args.since,
        );
        const newest = scanned[0];
        const lastAt = newest ? sentAt(newest) : null;
        const upcomingEvent =
          event.startsAt != null && event.startsAt >= args.now - DAY_MS;
        if (!upcomingEvent && lastAt == null) return;
        const cursor = cursors.get(`event:${String(event._id)}`) ?? null;
        const readUpTo = cursor?.lastReadAt ?? 0;
        const unreadRows = scanned.filter(
          (row) =>
            sentAt(row) > readUpTo && (me == null || row.senderPersonId !== me),
        );
        events.push({
          eventId: String(event._id),
          title: String(event.title ?? "Untitled event"),
          startsAt: event.startsAt ?? null,
          stage: String(event.stage ?? ""),
          lastAt,
          unread: unreadRows.length,
          unreadCapped:
            scanned.length >= UNREAD_SCAN && unreadRows.length >= UNREAD_SCAN,
          preview: await previewOf(ctx, newest),
          myCursorId: cursor?.id ?? null,
          lastReadAt: cursor?.lastReadAt ?? null,
        });
      }),
    );
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
    const scanned = (await inChannel(ctx, event._id, UNREAD_SCAN)).filter(
      (row) =>
        row.tenantId === tenantId && live(row) && sentAt(row) >= args.since,
    );
    const cursor =
      (await readCursorsFor(ctx, tenantId, auth.id)).get(
        `event:${String(event._id)}`,
      ) ?? null;
    const readUpTo = cursor?.lastReadAt ?? 0;
    const newest = scanned[0];
    return {
      count: scanned.length,
      countCapped: scanned.length >= UNREAD_SCAN,
      lastAt: newest ? sentAt(newest) : null,
      preview: await previewOf(ctx, newest),
      unread: scanned.filter(
        (row) =>
          sentAt(row) > readUpTo && (me == null || row.senderPersonId !== me),
      ).length,
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
