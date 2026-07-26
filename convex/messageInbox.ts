import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Idempotent inbound message ingestion (spec §4.4 "Done when": replaying the
// same provider delivery creates no duplicate message). Provider-neutral: a
// provider sync action (authenticated, like the QBO/Calendar syncs) or an
// operator "log inbound" action calls this. It match-or-creates a MessageThread
// by provider thread id, dedups the message by provider message id, and stores
// the message as inbound plain text. Replays return the existing ids.
//
// The body is stored as TEXT only — callers must reduce any inbound provider
// HTML to plain text before calling, so there is no stored-XSS surface and the
// UI never renders message bodies as HTML.

export const ingestInboundMessage = action({
  args: {
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    providerThreadId: v.string(),
    providerMessageId: v.string(),
    senderIdentity: v.optional(v.string()),
    bodyText: v.string(),
    subject: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    rawPayload: v.optional(v.string()),
    contactId: v.optional(v.id("clientContacts")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    threadId: Id<"messageThreads">;
    messageId: Id<"messages">;
    isDuplicate: boolean;
    threadCreated: boolean;
  }> => {
    const provider = args.provider.trim();
    const providerThreadId = args.providerThreadId.trim();
    const providerMessageId = args.providerMessageId.trim();
    const bodyText = args.bodyText.trim();
    if (!provider || !providerThreadId || !providerMessageId) {
      throw new ConvexError(
        "provider, providerThreadId, and providerMessageId are required",
      );
    }
    if (!bodyText) {
      throw new ConvexError("Message text is required");
    }

    // 1. Dedup by provider message id — a replay is an idempotent no-op.
    const dups = await ctx.runQuery(
      api.queries.listMessageByProviderMessageId,
      { providerMessageId },
    );
    const existingMessage = dups.find((m) => m.deletedAt == null);
    if (existingMessage) {
      return {
        threadId: existingMessage.threadId,
        messageId: existingMessage._id,
        isDuplicate: true,
        threadCreated: false,
      };
    }

    // 2. Match-or-create the thread by provider thread id (and provider, since a
    // thread id is unique within a provider account, not globally).
    const candidates = await ctx.runQuery(
      api.queries.listMessageThreadByProviderThreadId,
      { providerThreadId },
    );
    const existingThread = candidates.find(
      (t) => t.provider === provider && t.deletedAt == null,
    );
    let threadId: Id<"messageThreads">;
    let threadCreated: boolean;
    if (existingThread) {
      threadId = existingThread._id;
      threadCreated = false;
    } else {
      const created = await ctx.runMutation(
        api.mutations.MessageThread_create,
        {
          provider,
          providerAccountId: args.providerAccountId,
          providerThreadId,
          subject: args.subject,
          senderIdentity: args.senderIdentity,
          contactId: args.contactId,
        },
      );
      // Literal `create` allocating mutations return { _id, ...doc }.
      threadId = created._id;
      threadCreated = true;
    }

    // 3. Post the inbound message. _createVia* allocating mutations return { docId }.
    const posted = await ctx.runMutation(api.mutations.Message_createViaPost, {
      threadId,
      direction: "inbound",
      status: "received",
      bodyText,
      providerMessageId,
      senderIdentity: args.senderIdentity,
      sentAt: args.sentAt,
      rawPayload: args.rawPayload,
    });

    return {
      threadId,
      messageId: posted.docId,
      isDuplicate: false,
      threadCreated,
    };
  },
});
