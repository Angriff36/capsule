/**
 * AUTHOR SEAM helpers for convex/teamChat.ts (team chat reads). Pure reads:
 * decryption, tenant-checked hydration, and index walks that stop at the
 * retention window. Nothing here writes.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthContext, type AppAuthContext } from "./authContext";
import { decrypt, encrypt } from "./encryption";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
import { chatPreviewText } from "../../src/features/chat/chatLinkTokens";

/** Newest messages a thread returns; older ones are history, not chat. */
export const MAX_THREAD_MESSAGES = 400;
/**
 * Hard ceiling on one person's messages walked per query. The walk is
 * time-bounded (it stops at `since`), so this only guards a runaway range.
 */
export const PERSON_RANGE_CAP = 4000;
/** Per-channel unread rows counted for a badge; more than this reads "50+". */
export const UNREAD_SCAN = 50;
/** Attachment rows read per message: the sender's rows are the earliest. */
export const ATTACHMENT_SCAN = 50;
/**
 * Cursor rows read for one (channel, account): one after the upsert seam
 * (convex/teamChatCursor.ts) has folded duplicates; the cap only guards a
 * history of duplicates or a race.
 */
export const CURSOR_DUPLICATES_CAP = 50;


export type ChatAttachmentView = {
  _id: string;
  version: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  url: string | null;
};

export type ChatMessageView = {
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

/** Same envelope as the generated __encryptDoc, for one field. */
export async function encryptField(
  ctx: unknown,
  entity: string,
  property: string,
  plaintext: string,
): Promise<string> {
  const { ciphertext, keyId } = await encrypt(plaintext, {
    ctx,
    entity,
    property,
  });
  return JSON.stringify({ v: 1, kid: keyId, ct: ciphertext });
}

/** Same envelope handling as the generated __decryptDoc, per field. */
export async function decryptField(
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

/**
 * Every role base.manifest declares extends `staff`, so this is the set that
 * carries staffAccess — the StaffMessage read policy. checkRole is a
 * non-exported generated local, so the seam mirrors it (same pattern as
 * convex/notifications.ts); an unknown IdP role string is denied here just as
 * the generated queries deny it. Keep in sync with src/foundation/base.manifest.
 */
const STAFF_ROLES = new Set([
  "staff",
  "kitchen_staff",
  "kitchen_lead",
  "sales_staff",
  "event_staff",
  "inventory_staff",
  "procurement_staff",
  "logistics_staff",
  "driver",
  "workforce_staff",
  "finance_staff",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

/** A tenant member whose role grants staffAccess may use chat. */
export async function chatAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<AppAuthContext | null> {
  const auth = await getAuthContext(ctx);
  if (!auth || !auth.tenantId || !STAFF_ROLES.has(auth.role)) return null;
  if (orgCapabilityDeniesAction("staffAccess", auth.disabledCapabilities)) {
    return null;
  }
  return auth;
}

export const live = (row: { deletedAt?: number | null }) =>
  row.deletedAt == null;
/**
 * The message's position in the channel: Convex's commit time, a total order
 * with sub-millisecond precision. `createdAt` (the mutation's Date.now()) can
 * collide for two messages in the same millisecond, and a read cursor set to
 * the first would silently swallow the second.
 */
export const sentAt = (row: Doc<"staffMessages">) => row._creationTime;

/** A referenced doc only when it is this tenant's and not soft-deleted. */
export async function tenantEvent(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"events"> | null> {
  // Ids arrive from URL query parameters: a malformed one or another table's
  // id must read as "not available", never throw or fetch the wrong row.
  const eventId = ctx.db.normalizeId("events", id);
  const doc = eventId ? await ctx.db.get(eventId) : null;
  if (!doc || doc.tenantId !== tenantId || !live(doc)) return null;
  return doc;
}

export async function tenantPerson(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"people"> | null> {
  const personId = ctx.db.normalizeId("people", id);
  const doc = personId ? await ctx.db.get(personId) : null;
  if (!doc || doc.tenantId !== tenantId || !live(doc)) return null;
  return doc;
}

/** Files attached to one message by its sender, with signed URLs. */
export async function attachmentsFor(
  ctx: QueryCtx,
  tenantId: string,
  message: Doc<"staffMessages">,
): Promise<ChatAttachmentView[]> {
  if ((message.attachmentCount ?? 0) <= 0) return [];
  if (!message.senderAuthSubjectId) return [];
  // Parent AND uploader through the composite index: a row someone else
  // parks on this message id is never read. Bounded (a message carries at
  // most 20 files); ascending so the send order is kept.
  const rows = await ctx.db
    .query("attachments")
    .withIndex("by_parentId_and_uploadedById", (q) =>
      q
        .eq("parentId", String(message._id))
        .eq("uploadedById", message.senderAuthSubjectId),
    )
    .order("asc")
    .take(ATTACHMENT_SCAN);
  const mine = rows.filter(
    (row) =>
      row.parentType === "staffMessage" &&
      row.tenantId === tenantId &&
      live(row),
  );
  return Promise.all(
    mine.map(async (row) => ({
      _id: String(row._id),
      version: row.version,
      fileName: row.fileName,
      contentType: row.contentType,
      fileSize: row.fileSize,
      url: await (async () => {
        // A row can only come from the send seam, but a URL must never be
        // minted from an id that does not parse: the whole channel query
        // would fail for every reader.
        const storageId = ctx.db.system.normalizeId("_storage", row.storageId);
        return storageId ? await ctx.storage.getUrl(storageId) : null;
      })(),
    })),
  );
}

/**
 * One row for the UI. A row whose files never attached is still returned
 * (with no attachments) so it can be seen and marked read — hiding it would
 * leave an unread badge nothing can clear.
 */
export async function toView(
  ctx: QueryCtx,
  tenantId: string,
  row: Doc<"staffMessages">,
): Promise<ChatMessageView> {
  const [body, attachments] = await Promise.all([
    decryptField(ctx, "StaffMessage", "body", row.body),
    attachmentsFor(ctx, tenantId, row),
  ]);
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

/**
 * Newest-first rows from one person-keyed index range, walked until the
 * first row older than `since`. The index orders by creation time, so the
 * walk is bounded by the retention window, not by a count that a busy
 * sender's other conversations could exhaust.
 */
export async function walkSince(
  range: AsyncIterable<Doc<"staffMessages">>,
  since: number,
): Promise<Doc<"staffMessages">[]> {
  const out: Doc<"staffMessages">[] = [];
  for await (const row of range) {
    if (sentAt(row) < since) break;
    out.push(row);
    if (out.length >= PERSON_RANGE_CAP) break;
  }
  return out;
}

/** Newest-first rows sent by one person inside the window. */
export async function sentBy(
  ctx: QueryCtx,
  personId: Id<"people">,
  since: number,
): Promise<Doc<"staffMessages">[]> {
  return walkSince(
    ctx.db
      .query("staffMessages")
      .withIndex("by_senderPersonId", (q) => q.eq("senderPersonId", personId))
      .order("desc"),
    since,
  );
}

/** Newest-first rows received by one person inside the window. */
export async function receivedBy(
  ctx: QueryCtx,
  personId: Id<"people">,
  since: number,
): Promise<Doc<"staffMessages">[]> {
  return walkSince(
    ctx.db
      .query("staffMessages")
      .withIndex("by_recipientPersonId", (q) =>
        q.eq("recipientPersonId", personId),
      )
      .order("desc"),
    since,
  );
}

/** Preview line for the rail: the newest message's text, or its file count. */
export async function previewOf(
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
 * The caller's read cursor for each of the given channels, looked up directly
 * by (channel, account) through the composite index — never a channel-wide
 * page that could push the caller's row out, never the account's whole
 * cursor history, which grows with every channel visited.
 */
export async function readCursorsForChannels(
  ctx: QueryCtx,
  tenantId: string,
  authSubjectId: string,
  channelKeys: readonly string[],
): Promise<Map<string, { id: string; lastReadAt: number }>> {
  const cursors = new Map<string, { id: string; lastReadAt: number }>();
  await Promise.all(
    [...new Set(channelKeys)].map(async (channelKey) => {
      const rows = await ctx.db
        .query("staffChatReadCursors")
        .withIndex("by_channelKey_and_authSubjectId", (q) =>
          q.eq("channelKey", channelKey).eq("authSubjectId", authSubjectId),
        )
        .take(CURSOR_DUPLICATES_CAP);
      for (const row of rows) {
        if (row.tenantId !== tenantId) continue;
        const existing = cursors.get(channelKey);
        if (!existing || row.lastReadAt > existing.lastReadAt) {
          cursors.set(channelKey, {
            id: String(row._id),
            lastReadAt: row.lastReadAt,
          });
        }
      }
    }),
  );
  return cursors;
}
