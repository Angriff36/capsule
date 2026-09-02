/**
 * AUTHOR SEAM — send a team-chat message WITH its files in one transaction.
 *
 * The client uploads the blobs first, then calls this once. The message
 * (StaffMessage.send) and every Attachment row (Attachment.attach) commit
 * together through the generated governed commands — same guards, same
 * policies, same audit events — and `attachmentCount` is set here, from the
 * rows that exist, so no caller (this one or a direct command call) can
 * leave a message claiming files it does not have.
 *
 * The caller's idempotency key makes a retry after a lost response return the
 * same message instead of a duplicate: the message is keyed by it, each file
 * by it and the file's position. A retry that uploaded its files again gets
 * the first attempt's rows back, and its second blobs are deleted here.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { chatAuth, live } from "./lib/teamChatRead";

/** Files per message; mirrors src/features/chat/chatTypes.ts CHAT_MAX_FILES. */
const MAX_FILES = 20;

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
    const key = args.idempotencyKey.trim();
    if (key.length === 0) throw new Error("Idempotency key is required");
    if (args.body.trim().length === 0 && args.files.length === 0) {
      throw new Error("Message text or a file is required");
    }

    const created = (await ctx.runMutation(
      api.mutations.StaffMessage_createViaSend,
      {
        ...(args.eventId ? { eventId: args.eventId } : {}),
        ...(args.recipientPersonId
          ? { recipientPersonId: args.recipientPersonId }
          : {}),
        body: args.body,
        ...(args.mentionedPersonIds
          ? { mentionedPersonIds: args.mentionedPersonIds }
          : {}),
        idempotencyKey: key,
      },
    )) as { docId?: string } | null;
    const docId = created?.docId;
    if (!docId) throw new Error("The message was not created.");

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
        idempotencyKey: `${key}:file:${index}`,
      });
    }

    // The rows are the truth: they set the message's count, and any blob this
    // call uploaded that no row references (a retry's second upload) goes.
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
        await ctx.storage.delete(file.storageId as Id<"_storage">);
      }
    }
    const message = await ctx.db.get(docId as Id<"staffMessages">);
    if (message && message.attachmentCount !== rows.length) {
      await ctx.db.patch(message._id, { attachmentCount: rows.length });
    }
    return { docId };
  },
});
