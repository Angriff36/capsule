/**
 * AUTHOR SEAM helpers for convex/teamChat.ts (team chat reads). Pure reads:
 * decryption, tenant-checked hydration, and index walks that stop at the
 * retention window. Nothing here writes.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getAuthContext, type AppAuthContext } from "./authContext";
import { decrypt } from "./encryption";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";
import { chatPreviewText } from "../../src/features/chat/chatLinkTokens";

/** Newest messages a thread returns; older ones are history, not chat. */
export const MAX_THREAD_MESSAGES = 400;
/** Rows read per event-channel index range before the live/since filters. */
export const RANGE_TAKE = 800;
/**
 * Hard ceiling on one person's messages walked per query. The walk is
 * time-bounded (it stops at `since`), so this only guards a runaway range.
 */
export const PERSON_RANGE_CAP = 4000;
/** Per-channel rows scanned for unread counts; more than this reads "50+". */
export const UNREAD_SCAN = 50;

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
export async function chatAuth(ctx: QueryCtx): Promise<AppAuthContext | null> {
  const auth = await getAuthContext(ctx);
  if (!auth || !auth.tenantId || !STAFF_ROLES.has(auth.role)) return null;
  if (orgCapabilityDeniesAction("staffAccess", auth.disabledCapabilities)) {
    return null;
  }
  return auth;
}

export const live = (row: { deletedAt?: number | null }) =>
  row.deletedAt == null;
export const sentAt = (row: Doc<"staffMessages">) =>
  row.createdAt ?? row._creationTime;

/** A referenced doc only when it is this tenant's and not soft-deleted. */
export async function tenantEvent(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"events"> | null> {
  const doc = await ctx.db.get(id as Id<"events">);
  if (!doc || doc.tenantId !== tenantId || !live(doc)) return null;
  return doc;
}

export async function tenantPerson(
  ctx: QueryCtx,
  tenantId: string,
  id: string,
): Promise<Doc<"people"> | null> {
  const doc = await ctx.db.get(id as Id<"people">);
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

/** Newest-first rows in one event channel (bounded index range). */
export async function inChannel(
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

/** The caller's newest read cursor per channel (duplicates collapse to the max). */
export async function readCursorsFor(
  ctx: QueryCtx,
  tenantId: string,
  authSubjectId: string,
): Promise<Map<string, { id: string; lastReadAt: number }>> {
  const rows = await ctx.db
    .query("staffChatReadCursors")
    .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", authSubjectId))
    .collect();
  const cursors = new Map<string, { id: string; lastReadAt: number }>();
  for (const row of rows) {
    if (row.tenantId !== tenantId) continue;
    const existing = cursors.get(row.channelKey);
    if (!existing || row.lastReadAt > existing.lastReadAt) {
      cursors.set(row.channelKey, {
        id: String(row._id),
        lastReadAt: row.lastReadAt,
      });
    }
  }
  return cursors;
}
