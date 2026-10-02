// AUTHOR-OWNED — "Email the invoice" (PL-OUTBOUND, AC-107/AC-109/AC-352): the
// first email a client gets with an invoice. It carries the invoice PDF and no
// payment link (online card payment is not switched on). It keeps the same
// send record as a payment reminder, refuses to send the same balance twice in
// a day, explains a failure in plain words, and shows in the invoice's email
// conversation.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  buildInvoiceReminderPdf,
  invoiceReminderPdfFileName,
} from "./lib/invoiceReminderPdf";
import {
  artifactFingerprint,
  classifyReminderFailure,
  emailServiceFailureKind,
  maskEmail,
  recentSameBalanceSend,
  ReminderDeliveryError,
  reminderRemedy,
} from "./lib/reminderDelivery";
import {
  bytesToBase64,
  fromAddress,
  safeProviderMessage,
} from "./invoiceReminders";
import {
  INVOICE_EMAIL_TEMPLATE,
  renderInvoiceEmail,
} from "../src/lib/invoiceEmail";

export const INVOICE_EMAIL_EVENT = {
  sent: "InvoiceEmailSent",
  failed: "InvoiceEmailFailed",
} as const;

/** Sent, viewed, overdue, part paid or paid: an invoice the client may get. */
const EMAILABLE_STATUSES = new Set([
  "sent",
  "viewed",
  "overdue",
  "partial",
  "paid",
]);

export interface InvoiceEmailResult {
  /** "sent" = the email service took the email. */
  status: "sent" | "already_sent";
  emailId?: string;
  /** Who it went to (masked); for "already_sent" also when it went. */
  sentAt?: number;
  to?: string;
}

export const recordEvent = internalMutation({
  args: {
    type: v.union(
      v.literal(INVOICE_EMAIL_EVENT.sent),
      v.literal(INVOICE_EMAIL_EVENT.failed),
    ),
    invoiceId: v.id("invoices"),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "Invoice",
      entityId: String(args.invoiceId),
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

export const send = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<InvoiceEmailResult> => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredFrom = process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
    if (!resendApiKey || !configuredFrom) {
      // Server setup: RESEND_API_KEY and INVOICE_REMINDER_FROM_EMAIL in the
      // Convex environment. No payment-provider setup is needed.
      throw new ConvexError(reminderRemedy("not_set_up"));
    }
    const auth = await getAuthContext(ctx);
    const invoice = await ctx.runQuery(api.queries.getInvoice, {
      id: args.invoiceId,
    });
    if (!invoice || !auth.tenantId || auth.tenantId !== invoice.tenantId) {
      throw new ConvexError(
        "Capsule could not find this invoice. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    if (
      invoice.deletedAt != null ||
      !EMAILABLE_STATUSES.has(String(invoice.status))
    ) {
      throw new ConvexError(
        "Mark the invoice sent before emailing it. A void invoice cannot be emailed.",
      );
    }
    const tenantId = invoice.tenantId;
    const context = await ctx.runQuery(
      internal.invoiceReminders.loadDeliveryContext,
      { invoiceId: args.invoiceId, tenantId },
    );
    if (!context) {
      throw new ConvexError(
        "Capsule could not find this invoice. It may have been removed, or your role cannot open it. Ask a manager.",
      );
    }
    const amountDue = Number(context.invoice.amountDue ?? 0);
    const recent = recentSameBalanceSend(
      context.ledger,
      INVOICE_EMAIL_EVENT.sent,
      amountDue,
      Date.now(),
    );
    if (recent) {
      return {
        status: "already_sent",
        sentAt: recent.createdAt,
        to:
          typeof recent.payload.recipientMasked === "string"
            ? recent.payload.recipientMasked
            : undefined,
      };
    }

    const record = (
      type: (typeof INVOICE_EMAIL_EVENT)[keyof typeof INVOICE_EMAIL_EVENT],
      payload: Record<string, unknown>,
    ) =>
      ctx.runMutation(internal.invoiceEmail.recordEvent, {
        type,
        invoiceId: args.invoiceId,
        payload: { tenantId, source: "manual", attempt: 0, ...payload },
      });

    try {
      if (!context.recipient) {
        throw new ReminderDeliveryError(
          "no_recipient",
          "No client account or active billing-contact email is available.",
        );
      }
      const recipient = context.recipient;
      const invoiceNumber = String(
        context.invoice.invoiceNumber || context.invoice._id,
      );
      const dueDate =
        context.invoice.dueDate == null
          ? null
          : Number(context.invoice.dueDate);
      const email = renderInvoiceEmail({
        companyName: context.organization.displayName,
        companyAddress: context.organization.address,
        primaryColor: context.organization.primaryColor,
        accentColor: context.organization.accentColor,
        clientName: recipient.name,
        invoiceNumber,
        total: Number(context.invoice.total ?? 0),
        amountDue,
        dueDate,
        eventTitle: context.eventTitle,
      });
      const pdf = buildInvoiceReminderPdf({
        invoiceNumber,
        issuedAt: context.invoice.issuedAt,
        dueDate: dueDate ?? Number(context.invoice.issuedAt ?? Date.now()),
        subtotal: Number(context.invoice.subtotal),
        taxAmount: Number(context.invoice.taxAmount),
        discountAmount: Number(context.invoice.discountAmount),
        total: Number(context.invoice.total),
        amountPaid: Number(context.invoice.amountPaid),
        amountDue,
        clientName: recipient.name,
        clientEmail: recipient.email,
        eventTitle: context.eventTitle,
        companyName: context.organization.displayName,
        companyAddress: context.organization.address,
        primaryColor: context.organization.primaryColor,
        accentColor: context.organization.accentColor,
      });
      const from = fromAddress(context.organization.senderName, configuredFrom);
      const replyTo = context.organization.replyTo;
      const attachmentName = invoiceReminderPdfFileName(invoiceNumber);
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `invoice-send/${context.invoice._id}/${amountDue}`,
          },
          body: JSON.stringify({
            from,
            to: [recipient.email],
            ...(replyTo ? { reply_to: replyTo } : {}),
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [
              { filename: attachmentName, content: bytesToBase64(pdf) },
            ],
            tags: [
              { name: "category", value: INVOICE_EMAIL_TEMPLATE.id },
              { name: "invoice_id", value: String(context.invoice._id) },
            ],
          }),
        });
      } catch (cause) {
        throw new ReminderDeliveryError(
          "service_down",
          `Email service unreachable: ${safeProviderMessage(cause)}`,
        );
      }
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new ReminderDeliveryError(
          emailServiceFailureKind(response.status),
          typeof body?.message === "string"
            ? body.message
            : `Invoice email failed (${response.status}).`,
        );
      }
      const emailId = typeof body?.id === "string" ? body.id : null;
      if (!emailId) {
        throw new Error("Email provider did not return a delivery id.");
      }
      const sentAt = Date.now();
      await record(INVOICE_EMAIL_EVENT.sent, {
        emailId,
        providerState: "accepted",
        amountDue,
        recipientMasked: maskEmail(recipient.email),
        recipientSource: recipient.source,
        recipientContactId: recipient.contactId,
        sender: from,
        replyTo,
        subject: email.subject,
        template: INVOICE_EMAIL_TEMPLATE.id,
        templateVersion: INVOICE_EMAIL_TEMPLATE.version,
        attachments: [attachmentName],
        artifactFingerprint: await artifactFingerprint([
          email.subject,
          email.text,
          email.html,
          pdf,
        ]),
      });
      try {
        await ctx.runMutation(internal.outboundEmailThread.recordInvoiceEmail, {
          tenantId,
          invoiceId: args.invoiceId,
          senderAddress: configuredFrom,
          recipientLabel: `${recipient.name} (${maskEmail(recipient.email)})`,
          contactId: recipient.contactId,
          subject: email.subject,
          bodyText: email.text,
          providerMessageId: emailId,
          sentAt,
        });
      } catch (cause) {
        // The email went and its send record is kept; a missing conversation
        // entry must not fail the send.
        console.error(
          `Invoice email ${emailId} sent but not added to the conversation: ${safeProviderMessage(cause)}`,
        );
      }
      return { status: "sent", emailId, to: maskEmail(recipient.email) };
    } catch (cause) {
      const { kind, remedy } = classifyReminderFailure(cause);
      await record(INVOICE_EMAIL_EVENT.failed, {
        message: safeProviderMessage(cause),
        failureKind: kind,
        remedy,
        retryScheduled: false,
        recipientMasked: context.recipient
          ? maskEmail(context.recipient.email)
          : null,
      });
      throw new ConvexError(remedy);
    }
  },
});
