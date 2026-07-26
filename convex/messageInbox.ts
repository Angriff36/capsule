import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Idempotent inbound message ingestion (spec §4.4 "Done when": replaying the
// same provider delivery creates no duplicate message — including under
// concurrent retry). Provider-neutral: a provider sync action (authenticated,
// like the QBO/Calendar syncs) or an operator "log inbound" action calls this.
//
// Concurrency design: an action runs its query/mutation calls as separate
// transactions, so a plain check-then-insert races. Each allocating create is
// therefore passed a persistent `idempotencyKey`; the generated create checks
// and claims that key INSIDE its own transaction, so two concurrent calls with
// the same key resolve to one insert (the loser's OCC-retried read hits the
// cached result). Message dedup is additionally scoped to the resolved thread
// (account-scoped), not the provider message id globally.
//
// The body is stored as TEXT only — callers must reduce inbound provider HTML
// to plain text before calling, so there is no stored-XSS surface and the UI
// never renders message bodies as HTML.

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

    // 1. Resolve the thread (match by provider + provider thread id). If a
    // concurrent ingest already opened it, the idempotencyKey on the create
    // returns that row instead of inserting a second one.
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
          idempotencyKey: `mt:${provider}:${providerThreadId}`,
        },
      );
      // Literal `create` allocating mutations return { _id, ...doc }.
      threadId = created._id;
      threadCreated = true;
    }

    // 2. Dedup the message WITHIN this thread (account-scoped). A replay hits
    // the existing row; a concurrent replay is also caught by the create's
    // idempotencyKey below.
    const dups = await ctx.runQuery(
      api.queries.listMessageByProviderMessageId,
      { providerMessageId },
    );
    const existingMessage = dups.find(
      (m) => m.threadId === threadId && m.deletedAt == null,
    );
    if (existingMessage) {
      return {
        threadId,
        messageId: existingMessage._id,
        isDuplicate: true,
        threadCreated,
      };
    }

    // 3. Post the inbound message. The idempotencyKey (thread + provider
    // message id) makes a concurrent replay a no-op at the create level.
    // _createVia* allocating mutations return { docId }.
    const posted = await ctx.runMutation(api.mutations.Message_createViaPost, {
      threadId,
      direction: "inbound",
      status: "received",
      bodyText,
      providerMessageId,
      senderIdentity: args.senderIdentity,
      sentAt: args.sentAt,
      rawPayload: args.rawPayload,
      idempotencyKey: `msg:${threadId}:${providerMessageId}`,
    });

    return {
      threadId,
      messageId: posted.docId,
      isDuplicate: false,
      threadCreated,
    };
  },
});
