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

    // Provider thread ids are unique within a provider ACCOUNT, not globally —
    // so the account discriminator must ride along with every match/key to keep
    // two connected accounts with the same provider+thread id from collapsing
    // into one thread (and to keep message dedup account-scoped).
    const account = args.providerAccountId?.trim() || "";

    // 1. Resolve the thread (match by provider + account + provider thread id).
    // If a concurrent ingest already opened it, the idempotencyKey on the
    // create returns that row instead of inserting a second one.
    const candidates = await ctx.runQuery(
      api.queries.listMessageThreadByProviderThreadId,
      { providerThreadId },
    );
    const existingThread = candidates.find(
      (t) =>
        t.provider === provider &&
        (t.providerAccountId ?? "") === account &&
        t.deletedAt == null,
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
          idempotencyKey: `mt:${provider}:${account}:${providerThreadId}`,
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

// Default Lead.source when a thread is qualified, derived from the channel the
// inquiry came in on (spec §4.4 "Done when": the reply/history view shows the
// source network).
const LEAD_SOURCE_BY_PROVIDER: Record<string, string> = {
  internal: "Internal Inbox",
  email: "Email",
  sms: "SMS",
  social: "Social",
  other: "Inbox",
};

// Qualify a message thread into the sales pipeline by creating a Lead from the
// thread's context and linking it. Spec §4.4: "create an Inquiry/Lead when the
// thread first becomes sales-qualified"; Done-when: "Replaying the same
// provider delivery creates no duplicate ... lead."
//
// Operator-driven, NOT automatic: a sales staff member clicking this IS the
// "becomes sales-qualified" signal. We deliberately do not auto-create a lead
// from every inbound message — that would seed the pipeline with support mail
// and spam. The underlying Lead create enforces salesAccess, so qualification
// is a sales action even though threads themselves are staff-readable.
//
// Idempotent by construction:
//  - thread already has a leadId → return it (no create, no relink);
//  - the Lead create carries idempotencyKey `qualify:<threadId>`, so a double
//    click or two concurrent qualifies resolve to ONE lead;
//  - linkLead is called without a version (idempotent set of leadId), so the
//    second of two concurrent qualifies harmlessly re-sets the same id.
export const qualifyThreadAsLead = action({
  args: {
    threadId: v.id("messageThreads"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ leadId: Id<"leads">; created: boolean }> => {
    const thread = await ctx.runQuery(api.queries.getMessageThread, {
      id: args.threadId,
    });
    if (!thread) {
      throw new ConvexError("Message thread not found");
    }
    if (thread.leadId) {
      return { leadId: thread.leadId as Id<"leads">, created: false };
    }

    // Seed lead identity from what the inbox already shows — the sender for a
    // person inquiry, falling back to the subject, then a generic label. The
    // operator refines the details on the lead record afterwards.
    const sender = (thread.senderIdentity ?? "").trim();
    const subject = (thread.subject ?? "").trim();
    const givenName = sender || subject || "Inquiry";
    const source =
      LEAD_SOURCE_BY_PROVIDER[thread.provider as string] ?? "Inbox";

    const created = await ctx.runMutation(api.mutations.Lead_createViaCapture, {
      leadType: "person",
      source,
      estimatedValue: 0,
      givenName,
      notes: subject
        ? `From ${source} thread "${subject}"`
        : `From ${source} thread`,
      idempotencyKey: `qualify:${args.threadId}`,
    });
    const leadId = created.docId as Id<"leads">;

    await ctx.runMutation(api.mutations.MessageThread_linkLead, {
      docId: args.threadId,
      leadId,
    });

    return { leadId, created: true };
  },
});
