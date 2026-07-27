import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// §4.4 retryable sync-error queue: record an ingest/parse failure as a SyncError.
// Tenant-scoped find-or-upsert — REOPEN (bump attempts, refresh, return to
// pending) an existing error with the SAME (sourceSystem, recordType, externalId),
// else create. The generated command-idempotency cache is keyed by the key string
// ALONE (commandIdempotencyKeys.by_key, no tenantId), so an idempotency key would
// collide across tenants and suppress recurrences after dismissal — find-or-upsert
// avoids that data loss. Only reopens when externalId (provider message id) is
// present: two DISTINCT no-message-id failures must NOT collapse onto one row
// (that would overwrite and lose the independent failure). The verbatim input is
// stored as rawPayload ONLY when it fits under the cap — a truncated JSON blob
// can't round-trip through Retry, so an oversized payload is omitted (Retry then
// stays hidden for it). Best-effort: never masks the original error.
const MAX_RAW_PAYLOAD = 8192;
async function recordMessageSyncError(
  ctx: ActionCtx,
  opts: {
    provider: string;
    providerMessageId?: string;
    kind: "missing_field" | "parse_failed" | "unknown";
    errorMessage: string;
    payloadObject: unknown;
  },
): Promise<void> {
  try {
    const sourceSystem = opts.provider || "unknown";
    const externalId = opts.providerMessageId?.trim() || undefined;
    const fullPayload = JSON.stringify(opts.payloadObject);
    const rawPayload =
      fullPayload.length <= MAX_RAW_PAYLOAD ? fullPayload : undefined;
    if (externalId) {
      const existing = (await ctx.runQuery(api.queries.listSyncError, {})).find(
        (e) =>
          e.sourceSystem === sourceSystem &&
          e.recordType === "message" &&
          e.externalId === externalId &&
          e.deletedAt == null,
      );
      if (existing) {
        await ctx.runMutation(api.mutations.SyncError_reopen, {
          docId: existing._id,
          attempts: (existing.attempts ?? 0) + 1,
          kind: opts.kind,
          errorMessage: opts.errorMessage,
          rawPayload,
          version: existing.version,
        });
        return;
      }
    }
    await ctx.runMutation(api.mutations.SyncError_createViaRecord, {
      sourceSystem,
      recordType: "message",
      kind: opts.kind,
      errorMessage: opts.errorMessage,
      externalId,
      rawPayload,
    });
  } catch {
    // Swallow — the caller's thrown error is the user-facing signal; queue
    // recording must not mask it.
  }
}

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

    // §4.4: "Failed parsing appears in a retryable sync-error queue." Record a
    // SyncError for a failure before re-throwing — the throw still gives the
    // operator immediate feedback, and the queue captures the failure with the
    // verbatim input (rawPayload) so it can be retried or dismissed from the
    // inbox. Recording is best-effort and never masks the original error.
    //
    // TENANT-SCOPED FIND-OR-UPSERT (not a global create-idempotency key): the
    // generated command-idempotency cache is keyed by the key string ALONE
    // (commandIdempotencyKeys.by_key, no tenantId), so a key like
    // `syncerr:message:<providerMessageId>` would collide across tenants and
    // suppress a recurrence after dismissal (the cached create result is
    // immutable). Instead we look up an existing tenant error by
    // (sourceSystem, recordType, externalId) and REOPEN it (bump attempts,
    // refresh message/payload, return to pending), else create a new row.
    // Find-then-(reopen|create) in an action is not atomic, so two concurrent
    // identical failures could create two rows — acceptable for an error queue
    // (a rare duplicate is far less bad than silently dropping a failure).
    // §4.4: a failure is recorded to the sync-error queue before re-throwing —
    // the throw still gives the operator immediate feedback, and the queue
    // captures the failure (verbatim input when it fits) so it can be retried or
    // dismissed. See `recordMessageSyncError` for the tenant-scoped find-or-upsert.
    const recordSyncError = async (
      kind: "missing_field" | "parse_failed" | "unknown",
      errorMessage: string,
    ): Promise<void> =>
      recordMessageSyncError(ctx, {
        provider,
        providerMessageId,
        kind,
        errorMessage,
        payloadObject: args,
      });

    if (!provider || !providerThreadId || !providerMessageId) {
      await recordSyncError(
        "missing_field",
        "provider, providerThreadId, and providerMessageId are required",
      );
      throw new ConvexError(
        "provider, providerThreadId, and providerMessageId are required",
      );
    }
    if (!bodyText) {
      await recordSyncError("missing_field", "Message text is required");
      throw new ConvexError("Message text is required");
    }

    // Ingest core (thread resolve → message post). Any unexpected failure here
    // is recorded as a retryable parse_failed SyncError before propagating, so a
    // mid-ingest error does not disappear silently. (Pre-handler Zod rejection
    // of a malformed envelope is the caller/provider-layer's responsibility — a
    // provider webhook parses the raw envelope and calls this typed action only
    // after normalization; that provider layer is not built in this increment.)
    try {
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
      const posted = await ctx.runMutation(
        api.mutations.Message_createViaPost,
        {
          threadId,
          direction: "inbound",
          status: "received",
          bodyText,
          providerMessageId,
          senderIdentity: args.senderIdentity,
          sentAt: args.sentAt,
          rawPayload: args.rawPayload,
          idempotencyKey: `msg:${threadId}:${providerMessageId}`,
        },
      );

      return {
        threadId,
        messageId: posted.docId,
        isDuplicate: false,
        threadCreated,
      };
    } catch (err) {
      await recordSyncError(
        "parse_failed",
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  },
});

// Liberal field extraction from a raw provider envelope (try several common key
// names + casing, like the TPP/KM parsers). Returns the first non-empty trimmed
// string value, else undefined.
function pickEnvelopeField(
  parsed: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const val = parsed[k];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

// Provider raw-envelope ingress — the §4.4 "failed parsing appears in a
// retryable sync-error queue" parse boundary. Accepts a raw provider envelope
// (a signed-webhook body, a polling-API response, or an operator-pasted export)
// and normalizes it, calling the strongly-typed ingestInboundMessage ONLY after
// JSON parse + required-field validation succeed. A malformed envelope (bad JSON
// or missing thread/message id/body) lands in the sync-error queue instead of
// being silently lost to pre-handler Zod rejection of the typed action. The
// signed-webhook delivery + provider OAuth remain the deferred provider layer;
// this is the consumer-side parse boundary (mirrors the KM/TPP JSON-paste shape).
export const ingestProviderEnvelope = action({
  args: {
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    rawJson: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    recorded: "ingested" | "sync_error";
    threadId?: Id<"messageThreads">;
    messageId?: Id<"messages">;
    reason?: string;
  }> => {
    const provider = args.provider.trim();
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(args.rawJson);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("envelope must be a JSON object");
      }
      parsed = value as Record<string, unknown>;
    } catch (e) {
      await recordMessageSyncError(ctx, {
        provider,
        kind: "parse_failed",
        errorMessage: `Invalid JSON envelope: ${
          e instanceof Error ? e.message : String(e)
        }`,
        payloadObject: {
          provider,
          providerAccountId: args.providerAccountId,
          rawJson: args.rawJson,
        },
      });
      return {
        recorded: "sync_error",
        reason: "Invalid JSON envelope — recorded to the sync-error queue.",
      };
    }

    const providerThreadId = pickEnvelopeField(parsed, [
      "providerThreadId",
      "threadId",
      "thread_id",
      "conversationId",
      "conversation_id",
    ]);
    const providerMessageId = pickEnvelopeField(parsed, [
      "providerMessageId",
      "messageId",
      "message_id",
      "id",
    ]);
    const bodyText = pickEnvelopeField(parsed, [
      "bodyText",
      "body",
      "text",
      "message",
      "content",
      "plainText",
    ]);
    if (!providerThreadId || !providerMessageId || !bodyText) {
      await recordMessageSyncError(ctx, {
        provider,
        providerMessageId,
        kind: "missing_field",
        errorMessage:
          "Envelope missing required field: providerThreadId / providerMessageId / bodyText",
        payloadObject: {
          provider,
          providerAccountId: args.providerAccountId,
          envelope: parsed,
        },
      });
      return {
        recorded: "sync_error",
        reason:
          "Envelope missing required fields — recorded to the sync-error queue.",
      };
    }

    try {
      const result = await ctx.runAction(
        api.messageInbox.ingestInboundMessage,
        {
          provider,
          providerAccountId: args.providerAccountId,
          providerThreadId,
          providerMessageId,
          senderIdentity: pickEnvelopeField(parsed, [
            "senderIdentity",
            "sender",
            "from",
          ]),
          bodyText,
          subject: pickEnvelopeField(parsed, [
            "subject",
            "subject_line",
            "title",
          ]),
          rawPayload:
            args.rawJson.length <= MAX_RAW_PAYLOAD ? args.rawJson : undefined,
        },
      );
      return {
        recorded: "ingested",
        threadId: result.threadId,
        messageId: result.messageId,
      };
    } catch (e) {
      // ingestInboundMessage already recorded the failure (validation or
      // mid-ingest) via its own hook; surface the reason without duplicating.
      return {
        recorded: "sync_error",
        reason: e instanceof Error ? e.message : String(e),
      };
    }
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
