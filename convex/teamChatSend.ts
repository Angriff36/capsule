/**
 * AUTHOR SEAM — send a team-chat message WITH its files in one transaction.
 *
 * The client uploads the blobs first, then calls this once. The message
 * (StaffMessage.send) and every Attachment row (Attachment.attach) commit
 * together through the generated governed commands — same guards, same
 * policies, same audit events — so a closed tab or a lost response can never
 * leave a message that advertises files it does not have. The caller's
 * idempotency key makes a retry after an ambiguous response return the same
 * message instead of a duplicate: both nested commands are idempotent under
 * it (the attach keys derive from the message id and blob id).
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { chatAuth } from "./lib/teamChatRead";

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
    /** Stable per draft attempt; a retry with the same key is a no-op. */
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) throw new Error("Sign in to use team chat");
    if (args.files.length > MAX_FILES) {
      throw new Error(`A message can carry up to ${MAX_FILES} files.`);
    }
    if (args.idempotencyKey.trim().length === 0) {
      throw new Error("Idempotency key is required");
    }

    const created = (await ctx.runMutation(
      api.mutations.StaffMessage_createViaSend,
      {
        ...(args.eventId ? { eventId: args.eventId } : {}),
        ...(args.recipientPersonId
          ? { recipientPersonId: args.recipientPersonId }
          : {}),
        body: args.body,
        attachmentCount: args.files.length,
        ...(args.mentionedPersonIds
          ? { mentionedPersonIds: args.mentionedPersonIds }
          : {}),
        idempotencyKey: args.idempotencyKey,
      },
    )) as { docId?: string } | null;
    const docId = created?.docId;
    if (!docId) throw new Error("The message was not created.");

    for (const file of args.files) {
      await ctx.runMutation(api.mutations.Attachment_createViaAttach, {
        parentType: "staffMessage",
        parentId: docId,
        fileName: file.fileName,
        contentType: file.contentType || "application/octet-stream",
        fileSize: file.fileSize,
        storageId: file.storageId,
        idempotencyKey: `${docId}:${file.storageId}`,
      });
    }
    return { docId };
  },
});
