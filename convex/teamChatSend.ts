/**
 * AUTHOR SEAM — send a team-chat message WITH its files in one transaction.
 *
 * The client uploads the blobs first, then calls this once. The message
 * (StaffMessage.send) and every Attachment row (Attachment.attach) commit
 * together through the generated governed commands — same guards, same
 * policies, same audit events — and `attachmentCount` is set here, from the
 * rows that exist, so no caller (this one or a direct command call) can
 * leave a message claiming files it does not have. The command requires
 * text; a file-only message gets a transient placeholder that this seam
 * replaces with "" before the transaction commits, so it is never observable
 * and a direct call can never persist a blank message.
 *
 * The caller's idempotency key makes a retry after a lost response return the
 * same message instead of a duplicate. The nested keys are scoped to the
 * tenant and the caller (the generated key table is global), and the message
 * a key resolves to is verified against the call before anything else
 * happens. Files are keyed by position, never by blob id: a retry that
 * uploaded its files again is handed the first attempt's rows, and its
 * second blobs are deleted only when no live Attachment anywhere references
 * them.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { deleteBlobIfOrphan } from "./lib/blobs";
import { chatAuth, encryptField, live } from "./lib/teamChatRead";

/** Files per message; mirrors src/features/chat/chatTypes.ts CHAT_MAX_FILES. */
const MAX_FILES = 20;
/** Satisfies the command's text rule for a file-only message; replaced by "" below. */
const FILE_ONLY_PLACEHOLDER = "(file)";

export const sendWithFiles = mutation({
  args: {
    eventId: v.optional(v.string()),
    recipientPersonId: v.optional(v.string()),
    body: v.string(),
    mentionedPersonIds: v.optional(v.string()),
    files: v.array(
      v.object({
        storageId: v.string(),
        fileName: v.string(),
        contentType: v.string(),
        fileSize: v.number(),
      }),
    ),
    /** Stable per draft; a retry with the same key returns the same message. */
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) throw new Error("Sign in to use team chat");
    if (args.files.length > MAX_FILES) {
      throw new Error(`A message can carry up to ${MAX_FILES} files.`);
    }
    const draftKey = args.idempotencyKey.trim();
    if (draftKey.length === 0) throw new Error("Idempotency key is required");
    const text = args.body.trim();
    if (text.length === 0 && args.files.length === 0) {
      throw new Error("Message text or a file is required");
    }
    // Every file must be a real, uploaded blob before anything is written:
    // a message must never claim a file that does not exist, and a wrong-table
    // id must never reach the channel query's URL hydration.
    for (const file of args.files) {
      const storageId = ctx.db.system.normalizeId("_storage", file.storageId);
      const blob = storageId ? await ctx.db.system.get(storageId) : null;
      if (!blob) {
        throw new Error(
          `The upload for ${file.fileName} is missing. Attach it again.`,
        );
      }
    }

    // Scoped: another caller's (or tenant's) identical draft key can never
    // resolve to this message, and vice versa. The fixed kind segment comes
    // BEFORE the caller's key and the key is last, so a draft key that happens
    // to end in ":file:0" can never collide with another message's file key.
    const prefix = `${auth.tenantId}:${auth.id}:teamChat`;
    const messageKey = `${prefix}:message:${draftKey}`;
    const fileKey = (index: number) => `${prefix}:file:${index}:${draftKey}`;
    const replay =
      (await ctx.db
        .query("commandIdempotencyKeys")
        .withIndex("by_key", (q) => q.eq("key", messageKey))
        .first()) !== null;

    const created = (await ctx.runMutation(
      api.mutations.StaffMessage_createViaSend,
      {
        ...(args.eventId ? { eventId: args.eventId } : {}),
        ...(args.recipientPersonId
          ? { recipientPersonId: args.recipientPersonId }
          : {}),
        body: text.length > 0 ? args.body : FILE_ONLY_PLACEHOLDER,
        ...(args.mentionedPersonIds
          ? { mentionedPersonIds: args.mentionedPersonIds }
          : {}),
        idempotencyKey: messageKey,
      },
    )) as { docId?: string } | null;
    const docId = created?.docId;
    if (!docId) throw new Error("The message was not created.");

    // Trust nothing the key table hands back: the row must be this tenant's,
    // this sender's, and aimed where this call aims.
    const message = await ctx.db.get(docId as Id<"staffMessages">);
    if (
      !message ||
      message.tenantId !== auth.tenantId ||
      message.senderAuthSubjectId !== auth.id ||
      (message.eventId ?? null) !== (args.eventId ?? null) ||
      (message.recipientPersonId ?? null) !== (args.recipientPersonId ?? null)
    ) {
      throw new Error("This send key belongs to a different message");
    }
    if (!live(message)) {
      // Sent by an earlier attempt and removed since: nothing to attach.
      for (const file of args.files) {
        await deleteBlobIfOrphan(ctx, file.storageId);
      }
      return { docId };
    }

    // Keyed by the draft and the file's position, never by the blob: a retry
    // that re-uploaded its files (new blob ids) is handed the first attempt's
    // rows instead of adding a second set.
    for (const [index, file] of args.files.entries()) {
      await ctx.runMutation(api.mutations.Attachment_createViaAttach, {
        parentType: "staffMessage",
        parentId: docId,
        fileName: file.fileName,
        contentType: file.contentType || "application/octet-stream",
        fileSize: file.fileSize,
        storageId: file.storageId,
        idempotencyKey: fileKey(index),
      });
    }

    // The rows are the truth: they set the message's count, and a blob this
    // call uploaded that none of them references (a retry's second upload)
    // goes — unless some other live row holds it.
    const rows = (
      await ctx.db
        .query("attachments")
        .withIndex("by_parentId_and_uploadedById", (q) =>
          q.eq("parentId", docId).eq("uploadedById", auth.id),
        )
        .take(MAX_FILES + 1)
    ).filter(
      (row) =>
        row.tenantId === auth.tenantId &&
        row.parentType === "staffMessage" &&
        live(row),
    );
    const referenced = new Set(rows.map((row) => row.storageId));
    for (const file of args.files) {
      if (!referenced.has(file.storageId)) {
        await deleteBlobIfOrphan(ctx, file.storageId);
      }
    }

    const patch: { attachmentCount?: number; body?: string } = {};
    if (message.attachmentCount !== rows.length) {
      patch.attachmentCount = rows.length;
    }
    // First commit of a file-only message: the placeholder becomes "". A
    // replay leaves the body alone — the sender may have edited it since.
    if (!replay && text.length === 0) {
      patch.body = await encryptField(ctx, "StaffMessage", "body", "");
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(message._id, patch);
    }
    return { docId };
  },
});
