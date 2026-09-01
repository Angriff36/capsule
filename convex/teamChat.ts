/**
 * AUTHOR SEAM — team chat reads (direct messages + event channels).
 *
 * StaffMessage rows are generated (src/workforce/staff-message.manifest);
 * this seam only READS them, shaped for the chat UI:
 *   - listChannel: one thread (a DM pair or an event channel), decrypted,
 *     with its Attachment rows hydrated to download URLs.
 *   - listConversations: the rail — DM partners with unread counts and
 *     event channels with unread counts against the caller's read cursor.
 *   - searchLinkTargets: bounded record search for the `#` picker.
 *
 * Access: the generated read policy already hides other people's DMs; this
 * seam re-applies the same rule (a DM is visible only to its two parties)
 * and tenant-checks every FK it hydrates, so a guessed id from another
 * tenant yields nothing. No auth subject ids or HR fields leave the server.
 *
 * Reads are index-bounded: never a tenant-wide scan of staffMessages
 * (the Aug 2026 read storm). Wall-clock comes in as `since` / `now`.
 */
import { v } from "convex/values";
import { chatPreviewText } from "../src/features/chat/chatLinkTokens";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, type AppAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import { TEXT_TARGETS } from "./search";

/** Newest messages a thread returns; older ones are history, not chat. */
const MAX_THREAD_MESSAGES = 400;
/** Rows read per index range before the live/since filters. */
const RANGE_TAKE = 800;
/** Per-channel rows scanned for unread counts; more than this reads "50+". */
const UNREAD_SCAN = 50;
/** Channels stay in the rail from one day before the event starts. */
const DAY_MS = 86_400_000;

type ChatAttachmentView = {
  _id: string;
  version: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  url: string | null;
};

type ChatMessageView = {
  _id: string;
  version: number;
  senderPersonId: string;
  recipientPersonId: string | null;
  eventId: string | null;
  body: string;
  createdAt: number;
  editedAt: number | null;
  readAt: number | null;
  attachments: ChatAttachmentView[];
};

/** Same envelope handling as the generated __decryptDoc, per field. */
async function decryptField(
  ctx: unknown,
  entity: string,
  property: string,
  raw: unknown,
): Promise<string> {
  if (typeof raw !== "string") return "";
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope) ||
    !("kid" in envelope) ||
    !("ct" in envelope)
  ) {
    return raw;
  }
  if ((envelope as { v: unknown }).v !== 1) {
    throw new Error(
      `Unsupported encryption envelope for ${entity}.${property}`,
    );
  }
  return await decrypt(
    (envelope as { ct: string }).ct,
    (envelope as { kid: string }).kid,
    { ctx, entity, property },
  );
}

/** Any authenticated member of the tenant with a real role may use chat. */
async function chatAuth(ctx: QueryCtx): Promise<AppAuthContext | null> {
  const auth = await getAuthContext(ctx);
  if (!auth || auth.role === "anonymous" || !auth.tenantId) return null;
  return auth;
}

const live = (row: { deletedAt?: number | null }) => row.deletedAt == null;
const sentAt = (row: Doc<"staffMessages">) =>
  row.createdAt ?? row._creationTime;

/** A referenced doc only when it is this tenant's and not soft-deleted. */
async function tenantEvent(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"events"> | null> {
  const doc = await ctx.db.get(id as Id<"events">);
  if (!doc || doc.tenantId !== tenantId || !live(doc)) return null;
  return doc;
}

async function tenantPerson(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"people"> | null> {
  const doc = await ctx.db.get(id as Id<"people">);
  if (!doc || doc.tenantId !== tenantId || !live(doc)) return null;
  return doc;
}

/** Files attached to one message by its sender, with signed URLs. */
async function attachmentsFor(
  ctx: QueryCtx,
  tenantId: string,
  message: Doc<"staffMessages">,
): Promise<ChatAttachmentView[]> {
  if ((message.attachmentCount ?? 0) <= 0) return [];
  const rows = await ctx.db
    .query("attachments")
    .withIndex("by_parentId", (q) => q.eq("parentId", String(message._id)))
    .collect();
  const mine = rows.filter(
    (row) =>
      row.parentType === "staffMessage" &&
      row.tenantId === tenantId &&
      live(row) &&
      row.uploadedById != null &&
      row.uploadedById === message.senderAuthSubjectId,
  );
  return Promise.all(
    mine.map(async (row) => ({
      _id: String(row._id),
      version: row.version,
      fileName: row.fileName,
      contentType: row.contentType,
      fileSize: row.fileSize,
      url: await ctx.storage.getUrl(row.storageId as Id<"_storage">),
    })),
  );
}

async function toView(
  ctx: QueryCtx,
  tenantId: string,
  row: Doc<"staffMessages">,
): Promise<ChatMessageView | null> {
  const [body, attachments] = await Promise.all([
    decryptField(ctx, "StaffMessage", "body", row.body),
    attachmentsFor(ctx, tenantId, row),
  ]);
  // A message whose files all failed to attach and that has no text is noise.
  if (body.trim().length === 0 && attachments.length === 0) return null;
  return {
    _id: String(row._id),
    version: row.version,
    senderPersonId: String(row.senderPersonId),
    recipientPersonId: row.recipientPersonId
      ? String(row.recipientPersonId)
      : null,
    eventId: row.eventId ? String(row.eventId) : null,
    body,
    createdAt: sentAt(row),
    editedAt: row.editedAt ?? null,
    readAt: row.readAt ?? null,
    attachments,
  };
}

/** Newest-first rows sent by one person (bounded index range). */
async function sentBy(
  ctx: QueryCtx,
  personId: Id<"people">,
): Promise<Doc<"staffMessages">[]> {
  return ctx.db
    .query("staffMessages")
    .withIndex("by_senderPersonId", (q) => q.eq("senderPersonId", personId))
    .order("desc")
    .take(RANGE_TAKE);
}

/** Newest-first rows received by one person (bounded index range). */
async function receivedBy(
  ctx: QueryCtx,
  personId: Id<"people">,
): Promise<Doc<"staffMessages">[]> {
  return ctx.db
    .query("staffMessages")
    .withIndex("by_recipientPersonId", (q) =>
      q.eq("recipientPersonId", personId),
    )
    .order("desc")
    .take(RANGE_TAKE);
}

/** Newest-first rows in one event channel (bounded index range). */
async function inChannel(
  ctx: QueryCtx,
  eventId: Id<"events">,
  take: number,
): Promise<Doc<"staffMessages">[]> {
  return ctx.db
    .query("staffMessages")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc")
    .take(take);
}

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
      const me = auth.personId as Id<"people">;
      const [sent, received] = await Promise.all([
        sentBy(ctx, me),
        sentBy(ctx, other._id),
      ]);
      rows = [
        ...sent.filter((row) => row.recipientPersonId === other._id),
        ...received.filter((row) => row.recipientPersonId === me),
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
    const views = await Promise.all(
      kept.map((row) => toView(ctx, tenantId, row)),
    );
    return {
      messages: views.filter((view): view is ChatMessageView => view != null),
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

async function previewOf(
  ctx: QueryCtx,
  row: Doc<"staffMessages"> | undefined,
): Promise<string> {
  if (!row) return "";
  const body = await decryptField(ctx, "StaffMessage", "body", row.body);
  const text = chatPreviewText(body);
  if (text.length > 0) return text;
  const files = row.attachmentCount ?? 0;
  return files > 0 ? (files === 1 ? "Sent a file" : `Sent ${files} files`) : "";
}

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
    const me = auth.personId ? (auth.personId as Id<"people">) : null;

    // --- direct messages -------------------------------------------------
    const direct: DirectConversation[] = [];
    if (me) {
      const [sent, received] = await Promise.all([
        sentBy(ctx, me),
        receivedBy(ctx, me),
      ]);
      const byOther = new Map<
        string,
        { lastAt: number; unread: number; newest: Doc<"staffMessages"> }
      >();
      const consider = (row: Doc<"staffMessages">, other: string) => {
        if (row.tenantId !== tenantId || !live(row)) return;
        const at = sentAt(row);
        if (at < args.since) return;
        const entry = byOther.get(other);
        const unread =
          row.recipientPersonId === me && row.readAt == null ? 1 : 0;
        if (!entry) {
          byOther.set(other, { lastAt: at, unread, newest: row });
        } else {
          entry.unread += unread;
          if (at > entry.lastAt) {
            entry.lastAt = at;
            entry.newest = row;
          }
        }
      };
      for (const row of sent) {
        if (row.recipientPersonId) consider(row, String(row.recipientPersonId));
      }
      for (const row of received) consider(row, String(row.senderPersonId));
      for (const [personId, entry] of byOther) {
        direct.push({
          personId,
          lastAt: entry.lastAt,
          unread: entry.unread,
          preview: await previewOf(ctx, entry.newest),
        });
      }
      direct.sort((a, b) => b.lastAt - a.lastAt);
    }

    // --- event channels --------------------------------------------------
    const cursorRows = await ctx.db
      .query("staffChatReadCursors")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", auth.id))
      .collect();
    const cursors = new Map<string, { id: string; lastReadAt: number }>();
    for (const row of cursorRows) {
      if (row.tenantId !== tenantId) continue;
      const existing = cursors.get(row.channelKey);
      if (!existing || row.lastReadAt > existing.lastReadAt) {
        cursors.set(row.channelKey, {
          id: String(row._id),
          lastReadAt: row.lastReadAt,
        });
      }
    }

    const allEvents = await ctx.db
      .query("events")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    const candidates = allEvents.filter(
      (event) =>
        live(event) &&
        event.stage !== "cancelled" &&
        (event.startsAt == null || event.startsAt >= args.since),
    );

    const events: EventConversation[] = [];
    await Promise.all(
      candidates.map(async (event) => {
        const scanned = (await inChannel(ctx, event._id, UNREAD_SCAN)).filter(
          (row) => row.tenantId === tenantId && live(row),
        );
        const newest = scanned[0];
        const lastAt = newest ? sentAt(newest) : null;
        const upcoming =
          event.startsAt != null && event.startsAt >= args.now - DAY_MS;
        const active = lastAt != null && lastAt >= args.since;
        if (!upcoming && !active) return;
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
 * cursor, and the caller's cursor row so the client can touch it.
 */
export const channelSummary = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) return null;
    const tenantId = auth.tenantId;
    const event = await tenantEvent(ctx, tenantId, args.eventId);
    if (!event) return null;
    const me = auth.personId ? (auth.personId as Id<"people">) : null;
    const scanned = (await inChannel(ctx, event._id, UNREAD_SCAN)).filter(
      (row) => row.tenantId === tenantId && live(row),
    );
    const cursorRows = await ctx.db
      .query("staffChatReadCursors")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", auth.id))
      .collect();
    const key = `event:${String(event._id)}`;
    let cursor: { id: string; lastReadAt: number } | null = null;
    for (const row of cursorRows) {
      if (row.tenantId !== tenantId || row.channelKey !== key) continue;
      if (!cursor || row.lastReadAt > cursor.lastReadAt) {
        cursor = { id: String(row._id), lastReadAt: row.lastReadAt };
      }
    }
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
