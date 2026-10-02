// AUTHOR-OWNED — an email Capsule sends to a client also shows in the
// client's conversation (PL-OUTBOUND, AC-352): one email conversation per
// invoice, linked to the contact the email went to and to the invoice's
// event, with each sent email as an outbound message carrying the email
// service's id. Status "sent" = the email service took it; Capsule does not
// hear about delivery or bounces yet.
//
// Scheduled sends run with nobody signed in, so the conversation steps run as
// the company's system role (the send itself was already allowed).
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

export function invoiceThreadKey(invoiceId: string): string {
  return `invoice:${invoiceId}`;
}

export const recordInvoiceEmail = internalMutation({
  args: {
    tenantId: v.string(),
    invoiceId: v.id("invoices"),
    senderAddress: v.string(),
    recipientLabel: v.string(),
    contactId: v.union(v.string(), v.null()),
    subject: v.string(),
    bodyText: v.string(),
    providerMessageId: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ threadId: Id<"messageThreads"> }> => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.tenantId !== args.tenantId) {
      throw new Error("Invoice not found for this company");
    }
    const system = TenantSystemCommandRunner.forTenant(
      ctx,
      args.tenantId,
    ).context;
    const providerThreadId = invoiceThreadKey(String(args.invoiceId));
    const existing = (
      await ctx.db
        .query("messageThreads")
        .withIndex("by_providerThreadId", (q) =>
          q.eq("providerThreadId", providerThreadId),
        )
        .collect()
    ).find(
      (thread) => thread.tenantId === args.tenantId && thread.deletedAt == null,
    );

    let threadId: Id<"messageThreads">;
    if (existing) {
      threadId = existing._id;
    } else {
      const contact = args.contactId
        ? await ctx.db.get(args.contactId as Id<"clientContacts">)
        : null;
      const created = await system.runMutation(
        api.mutations.MessageThread_create,
        {
          provider: "email",
          providerAccountId: args.senderAddress,
          providerThreadId,
          subject: args.subject,
          senderIdentity: args.recipientLabel,
          contactId:
            contact &&
            contact.tenantId === args.tenantId &&
            contact.deletedAt == null
              ? contact._id
              : undefined,
          idempotencyKey: `tenant-shared/mt:email:${args.senderAddress}:${providerThreadId}`,
        },
      );
      threadId = created._id;
      if (invoice.eventId) {
        await system.runMutation(api.mutations.MessageThread_linkEvent, {
          docId: threadId,
          eventId: String(invoice.eventId),
        });
      }
    }

    const already = (
      await ctx.db
        .query("messages")
        .withIndex("by_providerMessageId", (q) =>
          q.eq("providerMessageId", args.providerMessageId),
        )
        .collect()
    ).some((message) => message.threadId === threadId);
    if (!already) {
      await system.runMutation(api.mutations.Message_createViaPost, {
        threadId,
        direction: "outbound",
        status: "sent",
        bodyText: args.bodyText,
        providerMessageId: args.providerMessageId,
        senderIdentity: args.senderAddress,
        sentAt: args.sentAt,
        idempotencyKey: `tenant-shared/msg:${threadId}:${args.providerMessageId}`,
      });
    }
    return { threadId };
  },
});
