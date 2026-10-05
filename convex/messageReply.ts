// AUTHOR-OWNED — reply to an email conversation from the inbox (PL-OUTBOUND,
// AC-107/AC-109/AC-352). Capsule sends the reply through the email service,
// answers the client's last email (same subject, In-Reply-To), and adds the
// reply to the conversation with the email service's id. Status "sent" = the
// email service took it; Capsule does not hear about delivery or bounces yet.
//
// A retry with the same requestId never sends twice: the email service and
// the conversation step both key on it. A failed send keeps nothing and
// throws a plain remedy; the screen keeps the typed reply.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  classifyReminderFailure,
  emailServiceFailureKind,
  maskEmail,
  ReminderDeliveryError,
  reminderRemedy,
} from "./lib/reminderDelivery";
import {
  companySender,
  decryptField,
  fromAddress,
  safeProviderMessage,
} from "./invoiceReminders";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;

/** "Ana <ana@garden.example>" -> "ana@garden.example". */
export function emailAddressIn(
  value: string | null | undefined,
): string | null {
  const match = value ? EMAIL_PATTERN.exec(value) : null;
  return match ? match[0] : null;
}

interface ReplyContext {
  tenantId: string;
  provider: string;
  subject: string | null;
  recipient: string | null;
  inReplyTo: string | null;
  senderName: string;
  replyTo: string | null;
}

export const loadReplyContext = internalQuery({
  args: { threadId: v.id("messageThreads"), tenantId: v.string() },
  handler: async (ctx, args): Promise<ReplyContext | null> => {
    const thread = await ctx.db.get(args.threadId);
    if (
      !thread ||
      thread.tenantId !== args.tenantId ||
      thread.deletedAt != null
    )
      return null;
    const messages = (
      await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
        .collect()
    ).filter((row) => row.tenantId === args.tenantId && row.deletedAt == null);
    const lastInbound = messages
      .filter((row) => row.direction === "inbound")
      .sort(
        (left, right) =>
          Number(right.sentAt ?? right._creationTime) -
          Number(left.sentAt ?? left._creationTime),
      )[0];
    let contactEmail: string | null = null;
    if (thread.contactId) {
      const contact = await ctx.db.get(
        thread.contactId as Id<"clientContacts">,
      );
      if (
        contact &&
        contact.tenantId === args.tenantId &&
        contact.deletedAt == null
      ) {
        contactEmail = emailAddressIn(
          await decryptField(ctx, "ClientContact", "email", contact.email),
        );
      }
    }
    const organizations = await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const organization =
      organizations.find(
        (row) => row.deletedAt == null && row.status === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    return {
      ...companySender(
        organization,
        organization?.brandDisplayName?.trim() ||
          organization?.name.trim() ||
          "Catering company",
      ),
      tenantId: thread.tenantId,
      provider: String(thread.provider),
      subject: thread.subject?.trim() || null,
      // The person who wrote last is who gets the answer; the linked contact
      // and the conversation's sender stand in when no email came in yet.
      recipient:
        emailAddressIn(lastInbound?.senderIdentity) ??
        contactEmail ??
        emailAddressIn(thread.senderIdentity),
      inReplyTo: lastInbound?.providerMessageId?.trim() || null,
    };
  },
});

export interface EmailReplyResult {
  messageId: string;
  emailId: string;
  to: string;
}

export const sendEmailReply = action({
  args: {
    threadId: v.id("messageThreads"),
    bodyText: v.string(),
    /** Made once per typed reply; a retry reuses it. */
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailReplyResult> => {
    const body = args.bodyText.trim();
    if (!body) throw new ConvexError("Write something in the reply.");
    const requestId = args.requestId.trim().slice(0, 100);
    if (!requestId)
      throw new ConvexError("Reload the page, then send the reply again.");
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
    if (!resendApiKey || !configuredFrom) {
      throw new ConvexError(reminderRemedy("not_set_up"));
    }
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) {
      throw new ConvexError(
        "Capsule could not find this conversation. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    const context = await ctx.runQuery(internal.messageReply.loadReplyContext, {
      threadId: args.threadId,
      tenantId: auth.tenantId,
    });
    if (!context) {
      throw new ConvexError(
        "Capsule could not find this conversation. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    if (context.provider !== "email") {
      throw new ConvexError(
        "Capsule can send replies to email conversations only. Copy the reply into the text or social app the client used.",
      );
    }
    if (!context.recipient) {
      throw new ConvexError(
        "This conversation has no email address to answer. Link it to a contact with an email, then send again.",
      );
    }
    const to = context.recipient;
    const subject = context.subject
      ? /^re:/iu.test(context.subject)
        ? context.subject
        : `Re: ${context.subject}`
      : "Re: your message";

    let emailId: string;
    try {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `inbox-reply/${args.threadId}/${requestId}`,
          },
          body: JSON.stringify({
            from: fromAddress(context.senderName, configuredFrom),
            to: [to],
            ...(context.replyTo ? { reply_to: context.replyTo } : {}),
            subject,
            text: body,
            ...(context.inReplyTo
              ? {
                  headers: {
                    "In-Reply-To": context.inReplyTo,
                    References: context.inReplyTo,
                  },
                }
              : {}),
            tags: [{ name: "category", value: "inbox_reply" }],
          }),
        });
      } catch (cause) {
        throw new ReminderDeliveryError(
          "service_down",
          `Email service unreachable: ${safeProviderMessage(cause)}`,
        );
      }
      const result = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      if (!response.ok) {
        throw new ReminderDeliveryError(
          emailServiceFailureKind(response.status),
          `Reply email failed (${response.status}).`,
        );
      }
      if (typeof result?.id !== "string" || !result.id) {
        throw new Error("Email provider did not return a delivery id.");
      }
      emailId = result.id;
    } catch (cause) {
      throw new ConvexError(classifyReminderFailure(cause).remedy);
    }

    const posted = (await ctx.runMutation(api.mutations.Message_createViaPost, {
      threadId: args.threadId,
      direction: "outbound",
      status: "sent",
      bodyText: body,
      providerMessageId: emailId,
      senderIdentity: configuredFrom,
      sentAt: Date.now(),
      idempotencyKey: `inbox-reply/${args.threadId}/${requestId}`,
    })) as { _id?: string; docId?: string };
    return {
      messageId: String(posted.docId ?? posted._id ?? ""),
      emailId,
      to: maskEmail(to),
    };
  },
});
