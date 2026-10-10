// AUTHOR-OWNED — reply to a client text from the inbox (PL-INBOX / AC-353).
// The reply goes from the company's texting number (the number the client
// texted) to the client's phone through Capsule's Twilio account, and is added
// to the conversation with Twilio's message id. Status "sent" = Twilio took
// it; Twilio's delivery report (POST /twilio/status) later sets delivered or
// failed (convex/smsAlertDelivery.ts recordDelivery).
//
// One typed reply sends at most one text. The send is claimed first; Twilio
// has no repeat key we can rely on, so when its answer is lost the claim
// stays and Send again refuses (a second text is worse than a missed one).
// A plain refusal from Twilio releases the claim so the reply can be fixed
// and sent again; the screen keeps the typed reply either way.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { insertStepEvent } from "./lib/commandAudit";
import {
  isSendablePhone,
  sendSms,
  TWILIO_UNSUBSCRIBED_CODE,
  TwilioSendError,
} from "./lib/twilio";
import { statusCallbackUrl } from "./smsAlertDelivery";
import { normalizePhone } from "./textInbox";

const CLAIM_ENTITY = "InboxTextReply";

const NOT_FOUND =
  "Capsule could not find this conversation. It may have been removed, or your role cannot open it. Ask a manager.";

/** Plain words for the refusals a caterer will actually see. */
export function textReplyRefusal(code: number | null): string {
  switch (code) {
    case TWILIO_UNSUBSCRIBED_CODE:
      return "This client texted STOP, so texts to them are blocked. Call or email them instead.";
    case 21211:
      return "This client's phone number is not a real number. Check it, then send again.";
    case 21614:
      return "This client's number cannot get texts (it may be a landline). Call or email them instead.";
    case 21606:
    case 21659:
    case 21212:
      return "Your company texting number cannot send through Capsule. Check the number on the Brand page.";
    default:
      return code == null
        ? "The text service refused the reply. Try again in a minute."
        : `The text service refused the reply (code ${code}). Try again in a minute.`;
  }
}

interface TextReplyContext {
  from: string | null;
  to: string | null;
  provider: string;
}

export const loadTextReplyContext = internalQuery({
  args: { threadId: v.id("messageThreads"), tenantId: v.string() },
  handler: async (ctx, args): Promise<TextReplyContext | null> => {
    const thread = await ctx.db.get(args.threadId);
    if (
      !thread ||
      thread.tenantId !== args.tenantId ||
      thread.deletedAt != null
    )
      return null;
    const company = (
      await ctx.db
        .query("organizations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
        .collect()
    ).find((org) => org.deletedAt == null);
    // The number the client texted; a thread started by hand uses the
    // company's current texting number.
    const from =
      normalizePhone(thread.providerAccountId) ||
      normalizePhone(company?.smsNumber) ||
      null;
    let to = normalizePhone(thread.providerThreadId) || null;
    if (!to && thread.contactId) {
      const contact = await ctx.db.get(
        thread.contactId as Id<"clientContacts">,
      );
      if (contact && contact.tenantId === args.tenantId)
        to = normalizePhone(contact.mobile ?? contact.phone) || null;
    }
    return { from, to, provider: String(thread.provider) };
  },
});

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Claims one send for this typed reply; false when it was already tried. */
export const claimTextReply = internalMutation({
  args: {
    tenantId: v.string(),
    threadId: v.string(),
    requestId: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<{ claimed: boolean }> => {
    const rows = (
      await ctx.db
        .query("manifestEvents")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.threadId))
        .collect()
    ).filter(
      (row) =>
        row.entity === CLAIM_ENTITY &&
        asRecord(row.payload).tenantId === args.tenantId &&
        asRecord(row.payload).requestId === args.requestId,
    );
    const started = rows.filter((row) => row.type === "TextReplyStarted");
    const released = rows.filter((row) => row.type === "TextReplyRefused");
    if (started.length > released.length) return { claimed: false };
    await insertStepEvent(ctx, {
      type: "TextReplyStarted",
      entity: CLAIM_ENTITY,
      entityId: args.threadId,
      payload: {
        tenantId: args.tenantId,
        threadId: args.threadId,
        requestId: args.requestId,
        actorId: args.actorId,
      },
      createdAt: Date.now(),
    });
    return { claimed: true };
  },
});

/** Twilio plainly refused: the same typed reply may be sent again. */
export const releaseTextReply = internalMutation({
  args: {
    tenantId: v.string(),
    threadId: v.string(),
    requestId: v.string(),
    code: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    await insertStepEvent(ctx, {
      type: "TextReplyRefused",
      entity: CLAIM_ENTITY,
      entityId: args.threadId,
      payload: {
        tenantId: args.tenantId,
        threadId: args.threadId,
        requestId: args.requestId,
        code: args.code ?? null,
      },
      createdAt: Date.now(),
    });
  },
});

export interface TextReplyResult {
  messageId: string;
  to: string;
}

export const sendTextReply = action({
  args: {
    threadId: v.id("messageThreads"),
    bodyText: v.string(),
    /** Made once per typed reply; a retry reuses it. */
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<TextReplyResult> => {
    const body = args.bodyText.trim();
    if (!body) throw new ConvexError("Write something in the reply.");
    const requestId = args.requestId.trim().slice(0, 100);
    if (!requestId)
      throw new ConvexError("Reload the page, then send the reply again.");
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!accountSid || !authToken) {
      throw new ConvexError("Texts are not switched on for Capsule yet.");
    }
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !auth.id) throw new ConvexError(NOT_FOUND);
    const context = await ctx.runQuery(
      internal.messageTextReply.loadTextReplyContext,
      { threadId: args.threadId, tenantId: auth.tenantId },
    );
    if (!context) throw new ConvexError(NOT_FOUND);
    if (context.provider !== "sms") {
      throw new ConvexError(
        "Capsule can text replies only in text conversations.",
      );
    }
    if (!context.from) {
      throw new ConvexError(
        "Your company has no texting number yet. Add the number clients text on the Brand page, then send again.",
      );
    }
    if (!context.to || !isSendablePhone(context.to)) {
      throw new ConvexError(
        "This conversation has no phone number to answer. Link it to a contact with a mobile number, then send again.",
      );
    }

    const claim = await ctx.runMutation(
      internal.messageTextReply.claimTextReply,
      {
        tenantId: auth.tenantId,
        threadId: String(args.threadId),
        requestId,
        actorId: String(auth.id),
      },
    );
    if (!claim.claimed) {
      throw new ConvexError(
        "Capsule already tried to send this reply and is not sure it went. Check the conversation or ask the client before sending it again.",
      );
    }

    let messageSid: string;
    try {
      messageSid = await sendSms({
        config: { accountSid, authToken, fromNumber: context.from },
        to: context.to,
        body,
        idempotencyKey: `inbox-text-reply/${args.threadId}/${requestId}`,
        statusCallback: statusCallbackUrl(auth.tenantId),
      });
    } catch (cause) {
      if (cause instanceof TwilioSendError) {
        await ctx.runMutation(internal.messageTextReply.releaseTextReply, {
          tenantId: auth.tenantId,
          threadId: String(args.threadId),
          requestId,
          ...(cause.code == null ? {} : { code: cause.code }),
        });
        throw new ConvexError(textReplyRefusal(cause.code));
      }
      // No answer from Twilio: the text may have gone. Keep the claim.
      throw new ConvexError(
        "Capsule could not hear back from the text service, so it is not sure the reply went. Check with the client before sending it again.",
      );
    }

    const posted = (await ctx.runMutation(api.mutations.Message_createViaPost, {
      threadId: args.threadId,
      direction: "outbound",
      status: "sent",
      bodyText: body,
      providerMessageId: messageSid,
      senderIdentity: context.from,
      sentAt: Date.now(),
      idempotencyKey: `inbox-text-reply/${args.threadId}/${requestId}`,
    })) as { _id?: string; docId?: string };
    return {
      messageId: String(posted.docId ?? posted._id ?? ""),
      to: `•••${context.to.slice(-4)}`,
    };
  },
});
